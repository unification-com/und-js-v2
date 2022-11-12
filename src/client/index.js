import crypto from "crypto";
import fetch from 'node-fetch';
import message from "../messages/proto";
import request from "request";
import secp256k1 from "secp256k1";

import CONFIG from "../config"
import * as fundCrypto from "../crypto"
import { checkNumber, isSelfDelegator } from "../utils/validateHelper"
import { convertAmount } from "../utils"
import * as msgFactory from "../messages/factory"
import {
  getMsgBeginRedelegate,
  getMsgRegisterWrkChain, getMsgSendIbc,
  getMsgUndelegate, getMsgVote,
  getMsgWithdrawDelegatorReward
} from "../messages/factory"

export class UndClient {
  constructor(url, broadcastMode = "BROADCAST_MODE_SYNC") {
    if (!url) {
      throw new Error("FUND Mainchain API url should not be null")
    }
    this.url = url;
    this.chainId = null;
    this.path = `${CONFIG.HD_PATH}0`;
    this.bech32MainPrefix = CONFIG.BECH32_PREFIX;
    this.broadcastMode = broadcastMode
    this.accountNumber = -1
    this.address = null
    this.privKey = null
    this.pubKeyAny = null
  }

  /*
   * Class setters and intialiser
   */

  /**
   * Initialize the client with the chain's ID. Asynchronous.
   * @return {Promise}
   */
  async initChain() {
    if (!this.chainId) {
      const data = await this.getChainInfo()
      this.chainId = data.node_info.network
      this.node_info = data.node_info
      this.node_app_version = data.application_version
    }
    return this
  }

  /**
   * Set the private key for the client
   * @param {String|Buffer} privKey private key as a hex string or Buffer
   */
  async setPrivateKey(privKey) {
    this.privKey = Buffer.from(privKey, "hex")
    this.pubKeyAny = msgFactory.getPubKeyAny(this.privKey)
    this.address = fundCrypto.getAddressFromPrivateKey(this.privKey.toString("hex"), this.bech32MainPrefix)
    const accData = await this.getAccount(this.address)
    if(accData?.account) {
      this.accountNumber = accData.account.account_number
    }
  }

  clean() {
    this.accountNumber = -1
    this.address = null
    this.privKey = null
    this.pubKeyAny = null
  }

  getPubKeyAny() {
    return this.pubKeyAny
  }

  /**
   * Set the mode for broadcasting a Tx
   * "BROADCAST_MODE_UNSPECIFIED", "BROADCAST_MODE_BLOCK", "BROADCAST_MODE_SYNC", "BROADCAST_MODE_ASYNC"
   * @param {String} broadcastMode sync = wait for checkTx, async = send and forget (faster but less guarantees), block = wait for block to process (default sync)
   */
  setBroadcastMode(broadcastMode) {
    this.broadcastMode = broadcastMode
  }

  /*
   * Send Transaction functions
   */

  /**
   * Transfer FUND to an address
   * @param {String} toAddress
   * @param {Number} amount
   * @param {Object} fee
   * @param {String} denom optional denom
   * @param {String} fromAddress optional fromAddress
   * @param {String} memo optional memo
   * @returns {Promise<*>}
   */
  async transferUnd(toAddress, amount, fee, denom = "nund", fromAddress = this.address, memo = "") {
    if (!fromAddress) {
      throw new Error("fromAddress should not be empty")
    }
    if (!toAddress) {
      throw new Error("toAddress should not be empty")
    }
    if(amount === 0) {
      throw new Error("amount should not be zero")
    }
    if(!fundCrypto.checkAddress(toAddress, this.bech32MainPrefix)) {
      throw new Error("invalid toAddress")
    }
    if(!fundCrypto.checkAddress(fromAddress, this.bech32MainPrefix)) {
      throw new Error("invalid fromAddress")
    }

    checkNumber(amount, "amount")
    const { amt, dnm } = convertAmount(amount, denom)
    const { amt: feeAmt, dnm: feeDnm } = convertAmount(fee.amount, fee.denom)

    const accData = await this.getAccount(fromAddress)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    // ---------------------------------- (1)txBody ----------------------------------
    const txBody = msgFactory.getMsgSendTx(fromAddress, toAddress, amt, dnm, memo)

    // --------------------------------- (2)authInfo ---------------------------------
    const authInfo = this.compileAuthInfo(
      accData.account.sequence,
      feeAmt,
      feeDnm,
      fee.gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);
    return this.broadcast(signedTxBytes)
  }

  /**
   * Transfer FUND via IBC to an address
   * @param {String} toAddress
   * @param {String} channel
   * @param {Number} amount
   * @param {Object} fee
   * @param {String} denom optional denom
   * @param {String} fromAddress optional fromAddress
   * @param {String} memo optional memo
   * @returns {Promise<*>}
   */
  async transferUndIbc(toAddress, channel, amount, fee, denom = "nund", fromAddress = this.address, memo = "") {
    if (!fromAddress) {
      throw new Error("fromAddress should not be empty")
    }
    if(!channel) {
      throw new Error("chainId should not be empty");
    }
    if (!toAddress) {
      throw new Error("toAddress should not be empty")
    }
    if(amount === 0) {
      throw new Error("amount should not be zero")
    }
    if(!fundCrypto.checkAddress(fromAddress, this.bech32MainPrefix)) {
      throw new Error("invalid fromAddress")
    }

    // todo check validity of chainId

    checkNumber(amount, "amount")
    const { amt, dnm } = convertAmount(amount, denom)
    const { amt: feeAmt, dnm: feeDnm } = convertAmount(fee.amount, fee.denom)

    const accData = await this.getAccount(fromAddress)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    // ---------------------------------- (1)txBody ----------------------------------
    const txBody = msgFactory.getMsgSendIbc(fromAddress, channel, toAddress, amt, dnm, memo)

    // --------------------------------- (2)authInfo ---------------------------------
    const authInfo = this.compileAuthInfo(
        accData.account.sequence,
        feeAmt,
        feeDnm,
        fee.gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);
    return this.broadcast(signedTxBytes)
  }

  /**
   * Register a BEACON
   * @param moniker {String} moniker
   * @param name {String} name optional name
   * @param fromAddress {String} fromAddress
   * @param gas {Number} gas optional gas
   * @param memo {String} memo optional memo
   * @returns {Promise<*>}
   */
  async registerBeacon(moniker, name= "", fromAddress = this.address, gas = 100000, memo = "") {
    if (!fromAddress) {
      throw new Error("fromAddress should not be empty")
    }
    if(!fundCrypto.checkAddress(fromAddress, CONFIG.BECH32_PREFIX)) {
      throw new Error("invalid fromAddress")
    }
    if(moniker === "" || moniker === null || moniker === undefined) {
      throw new Error("beacon must have a moniker")
    }

    const accData = await this.getAccount(fromAddress)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    const beaconParams = await this.getBeaconParams()

    const txBody = msgFactory.getMsgRegisterBeacon(moniker, name, fromAddress)

    const authInfo = this.compileAuthInfo(
      accData.account.sequence,
      beaconParams.params.fee_register,
      beaconParams.params.denom,
      gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);
    return this.broadcast(signedTxBytes)
  }

  /**
   * Submit a BEACON timestamp
   * @param beaconId {Number} beacon_id
   * @param hash {String} hash
   * @param submitTime {Number} submit_time
   * @param fromAddress {String} fromAddress
   * @param gas {Number} gas optional gas
   * @param memo {String} memo optional memo
   * @returns {Promise<*>}
   */
  async recordBeaconTimestamp(beaconId, hash, submitTime, fromAddress = this.address, gas = 100000, memo = "") {
    if (!fromAddress) {
      throw new Error("fromAddress should not be empty")
    }
    if(!fundCrypto.checkAddress(fromAddress, CONFIG.BECH32_PREFIX)) {
      throw new Error("invalid fromAddress")
    }

    if(parseInt(beaconId) <= 0) {
      throw new Error("must have beacon id")
    }
    if(hash === "" || hash === null || hash === undefined) {
      throw new Error("beacon must have hash")
    }
    if(parseInt(submitTime, 10) <= 0) {
      throw new Error("must have submit time")
    }

    const accData = await this.getAccount(fromAddress)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    const beaconParams = await this.getBeaconParams()

    const txBody = msgFactory.getMsgRecordBeaconTimestamp(beaconId, hash, submitTime, fromAddress)

    const authInfo = this.compileAuthInfo(
      accData.account.sequence,
      beaconParams.params.fee_record,
      beaconParams.params.denom,
      gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);

    return this.broadcast(signedTxBytes)
  }

  /**
   * Register a WRKChain
   * @param moniker {String} moniker
   * @param baseType {String} base_type optional base_type
   * @param name {String} name optional name
   * @param genesis {String} genesis optional genesis
   * @param fromAddress {String} fromAddress
   * @param gas {Number} gas optional gas
   * @param memo {String} memo optional memo
   * @returns {Promise<*>}
   */
  async registerWRKChain(moniker, baseType, name= "", genesis= "", fromAddress = this.address, gas = 100000, memo = "") {
    if (!fromAddress) {
      throw new Error("fromAddress should not be empty")
    }
    if(!fundCrypto.checkAddress(fromAddress, CONFIG.BECH32_PREFIX)) {
      throw new Error("invalid fromAddress")
    }
    if(moniker === "" || moniker === null || moniker === undefined) {
      throw new Error("wrkchain must have a moniker")
    }
    if(baseType === "" || baseType === null || baseType === undefined) {
      throw new Error("wrkchain must have a type")
    }

    const accData = await this.getAccount(fromAddress)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    const params = await this.getWRKChainParams()

    const txBody = msgFactory.getMsgRegisterWrkChain(moniker, name, genesis, baseType, fromAddress)

    const authInfo = this.compileAuthInfo(
      accData.account.sequence,
      params.params.fee_register,
      params.params.denom,
      gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);

    return this.broadcast(signedTxBytes)
  }

  /**
   * Submit WRKChain block header hashes
   * @param wrkchainId {Number} wrkchain_id
   * @param height {String} height
   * @param blockHash {String} blockhash
   * @param parentHash {String} parenthash optional parenthash
   * @param hash1 {String} hash1 optional hash1
   * @param hash2 {String} hash2 optional hash2
   * @param hash3 {String} hash3 optional hash3
   * @param fromAddress {String} fromAddress
   * @param gas {Number} gas optional gas
   * @param memo {String} memo optional memo
   * @param sequence {Number} sequence optional sequence
   * @returns {Promise<*>}
   */
  async recordWRKChainBlock(wrkchainId, height, blockHash, parentHash, hash1, hash2, hash3, fromAddress = this.address, gas = 120000, memo = "", sequence = null) {
    if (!fromAddress) {
      throw new Error("fromAddress should not be empty")
    }
    if(!fundCrypto.checkAddress(fromAddress, CONFIG.BECH32_PREFIX)) {
      throw new Error("invalid fromAddress")
    }

    if(parseInt(wrkchainId) <= 0) {
      throw new Error("must have wrkchain id")
    }
    if(blockHash === "" || blockHash === null || blockHash === undefined) {
      throw new Error("wrkchain must have blockhash")
    }
    if(parseInt(height) <= 0) {
      throw new Error("must have height")
    }

    const accData = await this.getAccount(fromAddress)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    const params = await this.getWRKChainParams()

    const txBody = msgFactory.getMsgRecordWrkChainBlock(wrkchainId, height, blockHash, parentHash, hash1, hash2, hash3, fromAddress)

    const authInfo = this.compileAuthInfo(
      accData.account.sequence,
      params.params.fee_record,
      params.params.denom,
      gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);

    return this.broadcast(signedTxBytes)

  }

  /**
   * Delegate FUND to a validator
   * @param {String} validator
   * @param {Number} amount
   * @param {Object} fee
   * @param {String} denom optional denom
   * @param {String} delegator optional delegator
   * @param {String} memo optional memo
   * @returns {Promise<*>}
   */
  async delegate(validator, amount, fee, denom = "nund", delegator = this.address, memo = "") {
    if (!delegator) {
      throw new Error("delegator should not be empty")
    }
    if(!fundCrypto.checkAddress(delegator, CONFIG.BECH32_PREFIX)) {
      throw new Error("invalid delegator")
    }
    if (!validator) {
      throw new Error("validator should not be empty")
    }
    if(!fundCrypto.checkAddress(validator, CONFIG.BECH32_VAL_PREFIX)) {
      throw new Error("invalid validator")
    }
    if(amount === 0) {
      throw new Error("amount should not be zero")
    }

    checkNumber(amount, "amount")
    const { amt, dnm } = convertAmount(amount, denom)
    const { amt: feeAmt, dnm: feeDnm } = convertAmount(fee.amount, fee.denom)

    const accData = await this.getAccount(delegator)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    const txBody = msgFactory.getMsgDelegate(delegator, validator, amt, dnm, memo)

    const authInfo = this.compileAuthInfo(
      accData.account.sequence,
      feeAmt,
      feeDnm,
      fee.gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);

    return this.broadcast(signedTxBytes)
  }

  /**
   * Undelegate FUND from a validator
   * @param {String} validator
   * @param {Number} amount
   * @param {Object} fee
   * @param {String} denom optional denom
   * @param {String} delegator optional delegator
   * @param {String} memo optional memo
   * @returns {Promise<*>}
   */
  async undelegate(validator, amount, fee, denom = "nund", delegator = this.address, memo = "") {
    if (!delegator) {
      throw new Error("delegator should not be empty")
    }
    if(!fundCrypto.checkAddress(delegator, CONFIG.BECH32_PREFIX)) {
      throw new Error("invalid delegator")
    }
    if (!validator) {
      throw new Error("validator should not be empty")
    }
    if(!fundCrypto.checkAddress(validator, CONFIG.BECH32_VAL_PREFIX)) {
      throw new Error("invalid validator")
    }
    if(amount === 0) {
      throw new Error("amount should not be zero")
    }

    checkNumber(amount, "amount")
    const { amt, dnm } = convertAmount(amount, denom)
    const { amt: feeAmt, dnm: feeDnm } = convertAmount(fee.amount, fee.denom)

    const accData = await this.getAccount(delegator)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    const txBody = msgFactory.getMsgUndelegate(delegator, validator, amt, dnm, memo)

    const authInfo = this.compileAuthInfo(
      accData.account.sequence,
      feeAmt,
      feeDnm,
      fee.gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);

    return this.broadcast(signedTxBytes)
  }

  /**
   * Redelegate FUND from one validator to another
   * @param {String} validatorFrom
   * @param {String} validatorTo
   * @param {Number} amount
   * @param {Object} fee
   * @param {String} denom optional denom
   * @param {String} delegator optional delegator
   * @param {String} memo optional memo
   * @param {Number} sequence optional sequence
   * @returns {Promise<*>}
   */
  async redelegate(validatorFrom, validatorTo, amount, fee, denom = "nund", delegator = this.address, memo = "") {
    if (!delegator) {
      throw new Error("delegator should not be empty")
    }
    if(!fundCrypto.checkAddress(delegator, CONFIG.BECH32_PREFIX)) {
      throw new Error("invalid delegator")
    }
    if (!validatorFrom) {
      throw new Error("validator should not be empty")
    }
    if(!fundCrypto.checkAddress(validatorFrom, CONFIG.BECH32_VAL_PREFIX)) {
      throw new Error("invalid validatorFrom")
    }
    if (!validatorTo) {
      throw new Error("validator should not be empty")
    }
    if(!fundCrypto.checkAddress(validatorTo, CONFIG.BECH32_VAL_PREFIX)) {
      throw new Error("invalid validatorTo")
    }
    if(amount === 0) {
      throw new Error("amount should not be zero")
    }

    checkNumber(amount, "amount")
    const { amt, dnm } = convertAmount(amount, denom)
    const { amt: feeAmt, dnm: feeDnm } = convertAmount(fee.amount, fee.denom)

    const accData = await this.getAccount(delegator)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    const txBody = msgFactory.getMsgBeginRedelegate(delegator, validatorFrom, validatorTo, amt, dnm, memo)

    const authInfo = this.compileAuthInfo(
      accData.account.sequence,
      feeAmt,
      feeDnm,
      fee.gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);

    return this.broadcast(signedTxBytes)
  }

  /**
   * Withdraw Delegator rewards
   * @param {String} validator
   * @param {Object} fee
   * @param {Boolean} commission optional include validator commission
   * @param {String} delegator optional delegator
   * @param {String} memo optional memo
   * @returns {Promise<*>}
   */
  async withdrawDelegationReward(validator, fee, commission = false, delegator = this.address, memo = "") {
    if (!delegator) {
      throw new Error("delegator should not be empty")
    }
    if(!fundCrypto.checkAddress(delegator, CONFIG.BECH32_PREFIX)) {
      throw new Error("invalid delegator")
    }
    if (!validator) {
      throw new Error("validator should not be empty")
    }

    if(commission) {
      if(!isSelfDelegator(validator, delegator, CONFIG.BECH32_PREFIX)) {
        throw new Error("delegator is not the delf delegator address")
      }
    }

    const { amt: feeAmt, dnm: feeDnm } = convertAmount(fee.amount, fee.denom)

    const accData = await this.getAccount(delegator)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    const txBody = msgFactory.getMsgWithdrawDelegatorReward(delegator, validator, commission, memo)

    const authInfo = this.compileAuthInfo(
      accData.account.sequence,
      feeAmt,
      feeDnm,
      fee.gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);

    return this.broadcast(signedTxBytes)
  }

  /**
   * Vote on a Governance Proposal
   * @param {Number} proposalId
   * @param {String} option yes | no | abstain | nowithveto
   * @param {Object} fee
   * @param {String} voter optional voter
   * @param {String} memo optional memo
   * @returns {Promise<*>}
   */
  async voteOnProposal(proposalId, option, fee, voter = this.address, memo = "") {
    if (!voter) {
      throw new Error("voter should not be empty")
    }
    if(!fundCrypto.checkAddress(voter, CONFIG.BECH32_PREFIX)) {
      throw new Error("invalid voter")
    }

    switch(option) {
      case "VOTE_OPTION_YES":
      case "VOTE_OPTION_ABSTAIN":
      case "VOTE_OPTION_NO":
      case "VOTE_OPTION_NO_WITH_VETO":
        break
      default:
        throw new Error(`"${option}" is an invalid vote option`)
    }

    const { amt: feeAmt, dnm: feeDnm } = convertAmount(fee.amount, fee.denom)

    const accData = await this.getAccount(voter)

    if(accData?.code) {
      throw new Error(accData.message)
    }

    const txBody = msgFactory.getMsgVote(proposalId, option, voter, memo)

    const authInfo = this.compileAuthInfo(
      accData.account.sequence,
      feeAmt,
      feeDnm,
      fee.gas,
    )

    // -------------------------------- sign --------------------------------
    const signedTxBytes = this.sign(txBody, authInfo);

    return this.broadcast(signedTxBytes)
  }

  /**
   * generates the required auth info to be included with the tx body for signing
   * @param sequence {Number} account sequence
   * @param feeAmount {Number} fee amount
   * @param feeDenom {String} fee denomination
   * @param gas {Number} gas limit
   * @param pubKeyAny
   * @returns {*}
   */
  compileAuthInfo(sequence, feeAmount, feeDenom, gas, pubKeyAny = this.pubKeyAny) {
    const signerInfo = msgFactory.getSignerInfo(pubKeyAny, sequence)
    const feeValue = msgFactory.getFee(feeAmount, feeDenom, gas)
    return msgFactory.getAuthInfo(signerInfo, feeValue)
  }

  /*
   * API getters
   */

  /**
   * get chain & network info
   * @returns {Promise<{result: {error: *}, status: number}|{result: *, status: *}|void>}
   */
  getChainInfo() {
    const nodeInfo = "/node_info";
    return fetch(this.url + nodeInfo).then(response => response.json())
  }

  /**
   * get account info
   * @param {String} address optional address
   * @returns {Promise<{result: {error: *}, status: number}|{result: *, status: *}|void>}
   */
  getAccount(address = this.address) {
    let api = "/cosmos/auth/v1beta1/accounts/";
    return fetch(this.url + api + address).then(response => response.json())
  }

  /**
   * get BEACON params
   * @returns {Promise<{result: {error: *}, status: number}|{result: *, status: *}|void>}
   */
  async getBeaconParams() {
    let api = "/mainchain/beacon/v1/params";
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get WRKChain params
   * @returns {Promise<{result: {error: *}, status: number}|{result: *, status: *}|void>}
   */
  async getWRKChainParams() {
    let api = "/mainchain/wrkchain/v1/params";
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get balances for given address
   * @param {String} address optional address
   * @param {String} denom optional denomination
   * @return {Promise} resolves with http response
   */
  async getBalance(address = this.address, denom = "nund") {
    let api = `/cosmos/bank/v1beta1/balances/${address}`;
    const res = await fetch(this.url + api).then(response => response.json())

    return res?.balances || []
  }

  /**
   * get transactions for an account
   * @param {String} address optional address
   * @param {Number} page page number, default 1
   * @param {Number} limit number of results per page, default 100, max 100
   * @param {String} order optional order
   * @return {Promise} resolves with http response
   */
  async getTransactions(address = this.address, page = 1, limit = 100, order="ORDER_BY_DESC") {
    if (limit > 100) limit = 100
    let api = `/cosmos/tx/v1beta1/txs?events=message.sender%3D'${address}'&pagination.limit=${limit}&order_by=${order}&pagination.count_total=true&pagination.offset=${page-1}`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get transactions received by an account - specifically, FUND transfers sent to the address
   * @param {String} address optional address
   * @param {Number} page page number, default 1
   * @param {Number} limit number of results per page, default 100, max 100
   * @param {String} order optional order
   * @return {Promise} resolves with http response
   */
  async getTransactionsReceived(address = this.address, page = 1, limit = 100, order="ORDER_BY_DESC") {
    if (limit > 100) limit = 100
    let api = `/cosmos/tx/v1beta1/txs?events=transfer.recipient%3D'${address}'&pagination.limit=${limit}&order_by=${order}&pagination.count_total=true&pagination.offset=${page-1}`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get governance proposals
   * @param {Number} page page number, default 1
   * @param {Number} limit number of results per page, default 100, max 100
   * @return {Promise} resolves with http response
   */
  async getGovernanceProposals(page = 1, limit = 100) {
    if (limit > 100) limit = 100
    let api = `/cosmos/gov/v1beta1/proposals?pagination.limit=${limit}&pagination.count_total=true&pagination.offset=${page-1}`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get governance proposals votes
   * @param {Number} proposalId id of proposal
   * @param {Number} page page number, default 1
   * @param {Number} limit number of results per page, default 100, max 100
   * @return {Promise} resolves with http response
   */
  async getGovernanceProposalVotes(proposalId, page = 1, limit = 100) {
    if (limit > 100) limit = 100
    let api = `/cosmos/gov/v1beta1/proposals/${proposalId}/votes?pagination.limit=${limit}&pagination.count_total=true&pagination.offset=${page-1}`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get governance proposals votes
   * @param {Number} proposalId id of proposal
   * @return {Promise} resolves with http response
   */
  async getGovernanceProposalTally(proposalId) {
    let api = `/cosmos/gov/v1beta1/proposals/${proposalId}/tally`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get transaction
   * @param {String} hash the transaction hash
   * @return {Promise} resolves with http response
   */
  async getTx(hash) {
    let api = `/cosmos/tx/v1beta1/txs/${hash}`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get delegations for address
   * @param {String} delegator optional address
   * @returns {Promise} resolves with http response
   */
  async getDelegations(delegator = this.address) {
    let api = `/cosmos/staking/v1beta1/delegations/${delegator}`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get unbonding delegations for address
   * @param {String} delegator optional Bech32 address
   * @param {String} valAddress optional Bech32 operator address
   * @returns {Promise} resolves with http response
   */
  async getUnbondingDelegations(delegator = this.address, valAddress = "") {
    let api = `/cosmos/staking/v1beta1/delegators/${delegator}/unbonding_delegations`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get delegator address's rewards
   * @param {String} delegator optional address
   * @param {String} valAddress optional Bech32 operator address
   * @returns {Promise} resolves with http response
   */
  async getDelegatorRewards(delegator = this.address, valAddress = "") {
    let suffix = ""
    if(valAddress.length > 0) {
      suffix = `/${valAddress}`
    }

    let api = `/cosmos/distribution/v1beta1/delegators/${delegator}/rewards${suffix}`
    return fetch(this.url + api).then(response => response.json())

  }

  /**
   * get delegator's current withdraw address
   * @param {String} delegator optional address
   * @returns {Promise} resolves with http response
   */
  async getDelegatorWithdrawAddress(delegator = this.address) {
    let api = `/cosmos/distribution/v1beta1/delegators/${delegator}/withdraw_address`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get a list of current validators based on filters
   * @param {String} status optional status. one of BOND_STATUS_BONDED, BOND_STATUS_UNBONDED, BOND_STATUS_UNBONDING. Default BOND_STATUS_BONDED
   * @param {Number} page optional page
   * @param {Number} limit optional limit
   * @param {String} valAddress optional Bech32 operator address
   * @returns {Promise} resolves with http response
   */
  async getValidators(status = "BOND_STATUS_BONDED", page = 1, limit = 100, valAddress = "") {
    if (limit > 100) limit = 100
    switch(status) {
      case "BOND_STATUS_BONDED":
      case "BOND_STATUS_UNBONDED":
      case "BOND_STATUS_UNBONDING":
        break
      default:
        status = "BOND_STATUS_BONDED"
        break
    }

    let suffix = `?status=${status}&pagination.offset=${page-1}&pagination.limit=${limit}`
    if(valAddress.length > 0) {
      suffix = `/${valAddress}`
    }

    let api = `/cosmos/staking/v1beta1/validators${suffix}`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get redelegations, with optional filters
   * @param {String} delegator optional delAddress Bech32 address
   * @returns {Promise} resolves with http response
   */
  async getRedelegations(delegator = this.address) {
    let api = `/cosmos/staking/v1beta1/delegators/${delegator}/redelegations`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get commission accrued by a validator
   * @param {String} delegator optional delAddress Bech32 address
   * @returns {Promise} resolves with http response
   */
  async getValidatorCommission(validator) {
    let api = `/cosmos/distribution/v1beta1/validators/${validator}/commission`
    return fetch(this.url + api).then(response => response.json())
  }

  /**
   * get total supply of FUND
   * @returns {Promise} resolves with http response
   */
  async getTotalSupply() {
    let api = `/mainchain/enterprise/v1/supply`
    return fetch(this.url + api).then(response => response.json())
  }

  /*
   * Sign & Broadcast functions
   */

  sign(txBody, authInfo, accountNumber = this.accountNumber, privKey = this.privKey) {
    const bodyBytes = message.cosmos.tx.v1beta1.TxBody.encode(txBody).finish();
    const authInfoBytes = message.cosmos.tx.v1beta1.AuthInfo.encode(authInfo).finish();
    const signDoc = new message.cosmos.tx.v1beta1.SignDoc({
      body_bytes: bodyBytes,
      auth_info_bytes: authInfoBytes,
      chain_id: this.chainId,
      account_number: Number(accountNumber)
    });
    let signMessage = message.cosmos.tx.v1beta1.SignDoc.encode(signDoc).finish();
    const hash = crypto.createHash("sha256").update(signMessage).digest();

    const sig = secp256k1.sign(hash, Buffer.from(privKey));
    const txRaw = new message.cosmos.tx.v1beta1.TxRaw({
      body_bytes: bodyBytes,
      auth_info_bytes: authInfoBytes,
      signatures: [sig.signature],
    });
    const txBytes = message.cosmos.tx.v1beta1.TxRaw.encode(txRaw).finish();
    const txBytesBase64 = Buffer.from(txBytes, 'binary').toString('base64');
    return txBytes;
  }

  // "BROADCAST_MODE_UNSPECIFIED", "BROADCAST_MODE_BLOCK", "BROADCAST_MODE_SYNC", "BROADCAST_MODE_ASYNC"
  broadcast(signedTxBytes, broadCastMode = this.broadcastMode) {
    const txBytesBase64 = Buffer.from(signedTxBytes, 'binary').toString('base64');

    var options = {
      method: 'POST',
      url: this.url + '/cosmos/tx/v1beta1/txs',
      headers:
        { 'Content-Type': 'application/json' },
      body: { tx_bytes: txBytesBase64, mode: broadCastMode },
      json: true
    };

    return new Promise(function(resolve, reject){
      request(options, function (error, response, body) {
        if (error) return reject(error);
        try {
          resolve(body);
        } catch(e) {
          reject(e);
        }
      });
    });
  }


  /*
   * Crypto/wallet interfaces
   */


  /**
   * Creates a private key and returns it and its address.
   * @return {object} the private key and address in an object.
   * {
   *  address,
   *  privateKey
   * }
   */
  createAccount() {
    const privateKey = fundCrypto.generatePrivateKey()
    return {
      privateKey,
      address: fundCrypto.getAddressFromPrivateKey(privateKey, CONFIG.BECH32_PREFIX)
    }
  }

  /**
   * Creates an account keystore object, and returns the private key and address.
   * @param {String} password
   *  {
   *  privateKey,
   *  address,
   *  keystore
   * }
   */
  createAccountWithKeystore(password) {
    if (!password) {
      throw new Error("password should not be falsy")
    }
    const privateKey = fundCrypto.generatePrivateKey()
    const address = fundCrypto.getAddressFromPrivateKey(privateKey, CONFIG.BECH32_PREFIX)
    const keystore = fundCrypto.generateKeyStore(privateKey, password)
    return {
      privateKey,
      address,
      keystore
    }
  }

  /**
   * Creates an account from mnemonic seed phrase.
   * @return {object}
   * {
   *  privateKey,
   *  address,
   *  mnemonic
   * }
   */
  createAccountWithMneomnic() {
    const mnemonic = fundCrypto.generateMnemonic()
    const privateKey = fundCrypto.getPrivateKeyFromMnemonic(mnemonic)
    const privateKeyHex = privateKey.toString("hex")
    const address = fundCrypto.getAddressFromPrivateKey(privateKeyHex, CONFIG.BECH32_PREFIX)
    const hdPath = `${CONFIG.HD_PATH}0`
    return {
      index: 0,
      hdPath,
      privateKey,
      privateKeyHex,
      address,
      mnemonic
    }
  }

  /**
   * Recovers an account from a keystore object.
   * @param {object} keystore object.
   * @param {string} password password.
   * {
   * privateKey,
   * address
   * }
   */
  recoverAccountFromKeystore(keystore, password) {
    const privateKey = fundCrypto.getPrivateKeyFromKeyStore(keystore, password)
    const address = fundCrypto.getAddressFromPrivateKey(privateKey, CONFIG.BECH32_PREFIX)
    return {
      privateKey,
      address
    }
  }

  /**
   * Recovers an account from a mnemonic seed phrase.
   * @param {String} mneomnic
   * {
   * privateKey,
   * address
   * }
   */
  recoverAccountFromMnemonic(mnemonic, index = 0) {
    const privateKey = fundCrypto.getPrivateKeyFromMnemonic(mnemonic, true, index)
    const privateKeyHex = privateKey.toString("hex")
    const address = fundCrypto.getAddressFromPrivateKey(privateKeyHex, CONFIG.BECH32_PREFIX)
    const hdPath = `${CONFIG.HD_PATH}${index}`
    return {
      index,
      hdPath,
      privateKey,
      privateKeyHex,
      address,
    }
  }

  /**
   * Recovers an account using private key.
   * @param {String} privateKey
   * {
   * privateKey,
   * address
   * }
   */
  recoverAccountFromPrivateKey(privateKey) {
    const address = fundCrypto.getAddressFromPrivateKey(privateKey, CONFIG.BECH32_PREFIX)
    return {
      privateKey,
      address
    }
  }

  /**
   * Validates an address.
   * @param {String} address
   * @param {String} prefix
   * @return {Boolean}
   */
  checkAddress(address, prefix = CONFIG.BECH32_PREFIX) {
    return fundCrypto.checkAddress(address, prefix)
  }

  /**
   * Returns the address for the current account if setPrivateKey has been called on this client.
   * @return {String}
   */
  getClientKeyAddress() {
    if (!this.privateKey) throw new Error("no private key is set on this client")
    const address = fundCrypto.getAddressFromPrivateKey(this.privateKey, CONFIG.BECH32_PREFIX)
    this.address = address
    return address
  }

  /**
   * Retuns a standard error mimicking the object returned by _httpClient.request
   * @param {String} errMsg the message to be put in result.error
   * @param {Number} status - status code, optional. Default 400
   * @returns {{result: {error: *}, status: number}}
   * @private
   */
  _stdError(errMsg, status = 400) {
    const stdError = {
      status: status,
      result: {
        error: errMsg
      }
    }

    return stdError
  }
}
