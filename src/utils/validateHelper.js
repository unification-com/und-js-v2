import * as bech32 from "bech32"

const MAX_INT64 = Math.pow(2, 63)

/**
 * validate the input number.
 * @param {Number} value
 */
export const checkNumber = (value, name = "input number") => {
  if (value <= 0) {
    throw new Error(`${name} should be a positive number`)
  }

  if (MAX_INT64 <= value) {
    throw new Error(`${name} should be less than 2^63`)
  }
}

export const getDelegatorAddressFromOpAddr = (operatorAddr, prefix) => {
  const address = bech32.decode(operatorAddr)
  return bech32.encode(prefix, address.words)
}

export const isSelfDelegator = (operator, delegator, prefix) => {
  const derivedDelegator = getDelegatorAddressFromOpAddr(operator, prefix)
  return derivedDelegator === delegator
}
