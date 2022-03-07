/**
 * @module crypto
 */

import cryp from "crypto-browserify"
import { v4 as uuid } from "uuid"
import is from "is_js"
import * as bip39 from "bip39"
import ecPkg from "elliptic"
import * as bip32 from "bip32";
import * as bech32 from "bech32";

import {
  ab2hexstring,
  sha3,
  sha256,
  sha256ripemd160,
} from "../utils"

import CONFIG from "../config"

// secp256k1 privkey is 32 bytes
const PRIVKEY_LEN = 32
const MNEMONIC_LEN = 256
const DECODED_ADDRESS_LEN = 20
const CURVE = "secp256k1"

const { ec: EC } = ecPkg;

const elliptic = new EC(CURVE)

/**
 * Decodes an address in bech32 format.
 * @param {string} value the bech32 address to decode
 */
export const decodeAddress = (value) => {
  const decodeAddress = bech32.decode(value)
  return Buffer.from(bech32.fromWords(decodeAddress.words))
}

/**
 * Checks whether an address is valid.
 * @param {string} address the bech32 address to decode
 * @param {string} hrp the prefix to check for the bech32 address
 * @return {boolean}
 */
export const checkAddress = (address, hrp) => {
  try {
    if (!address.startsWith(hrp)){
      return false
    }

    const decodedAddress = bech32.decode(address)
    const decodedAddressLength = decodeAddress(address).length
    if (decodedAddressLength === DECODED_ADDRESS_LEN &&
      decodedAddress.prefix === hrp) {
      return true
    }

    return false
  } catch (err) {
    return false
  }
}

/**
 * Encodes an address from input data bytes.
 * @param {string} value the public key to encode
 * @param {*} prefix the address prefix
 * @param {*} type the output type (default: hex)
 */
export const encodeAddress = (value, prefix = "und", type = "hex") => {
  const words = bech32.toWords(Buffer.from(value, type))
  return bech32.encode(prefix, words)
}

/**
 * Calculates the public key from a given private key.
 * @param {string} privateKeyHex the private key hexstring
 * @return {string} public key hexstring
 */
export const getPublicKeyFromPrivateKey = privateKeyHex => {
  if (!privateKeyHex || privateKeyHex.length !== PRIVKEY_LEN * 2) {
    throw new Error("invalid privateKey")
  }
  const curve = new EC(CURVE)
  const keypair = curve.keyFromPrivate(privateKeyHex, "hex")
  const unencodedPubKey = keypair.getPublic().encode("hex")
  return unencodedPubKey
}

/**
 * Gets an address from a public key hex.
 * @param {string} publicKeyHex the public key hexstring
 * @param {string} prefix the address prefix
 */
export const getAddressFromPublicKey = (publicKeyHex, prefix) => {
  const pubKey = elliptic.keyFromPublic(publicKeyHex, "hex")
  const pubPoint = pubKey.getPublic()
  const compressed = pubPoint.encodeCompressed()
  const hexed = ab2hexstring(compressed)
  const hash = sha256ripemd160(hexed) // https://git.io/fAn8N
  const address = encodeAddress(hash, prefix)
  return address
}

/**
 * Gets an address from a private key.
 * @param {string} privateKeyHex the private key hexstring
 */
export const getAddressFromPrivateKey = (privateKeyHex, prefix) => {
  return getAddressFromPublicKey(getPublicKeyFromPrivateKey(privateKeyHex), prefix)
}

/**
 * Generates a keystore object (web3 secret storage format) given a private key to store and a password.
 * @param {string} privateKeyHex the private key hexstring.
 * @param {string} password the password.
 * @return {object} the keystore object.
 */
export const generateKeyStore = (privateKeyHex, password) => {
  const salt = cryp.randomBytes(32)
  const iv = cryp.randomBytes(16)
  const cipherAlg = "aes-256-ctr"

  const kdf = "pbkdf2"
  const kdfparams = {
    dklen: 32,
    salt: salt.toString("hex"),
    c: 262144,
    prf: "hmac-sha256"
  }

  const derivedKey = cryp.pbkdf2Sync(Buffer.from(password), salt, kdfparams.c, kdfparams.dklen, "sha256")
  const cipher = cryp.createCipheriv(cipherAlg, derivedKey.slice(0, 32), iv)
  if (!cipher) {
    throw new Error("Unsupported cipher")
  }

  const ciphertext = Buffer.concat([cipher.update(Buffer.from(privateKeyHex, "hex")), cipher.final()])
  const bufferValue = Buffer.concat([derivedKey.slice(16, 32), Buffer.from(ciphertext, "hex")])

  return {
    version: 1,
    id: uuid({
      random: cryp.randomBytes(16)
    }),
    crypto: {
      ciphertext: ciphertext.toString("hex"),
      cipherparams: {
        iv: iv.toString("hex")
      },
      cipher: cipherAlg,
      kdf,
      kdfparams: kdfparams,
      // mac must use sha3 according to web3 secret storage spec
      mac: sha3(bufferValue.toString("hex"))
    }
  }
}

/**
 * Gets a private key from a keystore given its password.
 * @param {string} keystore the keystore in json format
 * @param {string} password the password.
 */
export const getPrivateKeyFromKeyStore = (keystore, password) => {

  if (!is.string(password)) {
    throw new Error("No password given.")
  }

  const json = is.object(keystore) ? keystore : JSON.parse(keystore)
  const kdfparams = json.crypto.kdfparams

  if (kdfparams.prf !== "hmac-sha256") {
    throw new Error("Unsupported parameters to PBKDF2")
  }

  const derivedKey = cryp.pbkdf2Sync(Buffer.from(password), Buffer.from(kdfparams.salt, "hex"), kdfparams.c, kdfparams.dklen, "sha256")
  const ciphertext = Buffer.from(json.crypto.ciphertext, "hex")
  const bufferValue = Buffer.concat([derivedKey.slice(16, 32), ciphertext])

  // try sha3 (new / ethereum keystore) mac first
  const mac = sha3(bufferValue.toString("hex"))
  if (mac !== json.crypto.mac) {
    // the legacy (sha256) mac is next to be checked. pre-testnet keystores used a sha256 digest for the mac.
    // the sha256 mac was not compatible with ethereum keystores, so it was changed to sha3 for mainnet.
    const macLegacy = sha256(bufferValue.toString("hex"))
    if (macLegacy !== json.crypto.mac) {
      throw new Error("Keystore mac check failed (sha3 & sha256) - wrong password?")
    }
  }

  const decipher = cryp.createDecipheriv(json.crypto.cipher, derivedKey.slice(0, 32), Buffer.from(json.crypto.cipherparams.iv, "hex"))
  const privateKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("hex")

  return privateKey
}

/**
 * Generates mnemonic phrase words using random entropy.
 */
export const generateMnemonic = () => bip39.generateMnemonic(MNEMONIC_LEN)

/**
 * Get a private key from mnemonic words.
 * @param {string} mnemonic the mnemonic phrase words
 * @param {Boolean} derive derive a private key using the default HD path (default: true)
 * @param {number} index the bip44 address index (default: 0)
 * @param {string} password according to bip39
 * @return {Buffer} hexstring
 */
export const getPrivateKeyFromMnemonic = (mnemonic, derive = true, index = 0, password = "") => {

  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error("wrong mnemonic format")
  }
  const seed = bip39.mnemonicToSeed(mnemonic, password)
  if (derive) {
    const master = bip32.fromSeed(seed)
    const child = master.derivePath(CONFIG.HD_PATH + index)
    return child.privateKey
  }
  return seed
}
