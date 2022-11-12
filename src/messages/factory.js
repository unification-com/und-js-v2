import message from "./proto"
import secp256k1 from "secp256k1"

export const getPubKeyAny = (privKey) => {
  const pubKeyByte = secp256k1.publicKeyCreate(privKey);
  var buf1 = new Buffer.from([10]);
  var buf2 = new Buffer.from([pubKeyByte.length]);
  var buf3 = new Buffer.from(pubKeyByte);
  const pubKey = Buffer.concat([buf1, buf2, buf3]);
  const pubKeyAny = new message.google.protobuf.Any({
    type_url: "/cosmos.crypto.secp256k1.PubKey",
    value: pubKey
  });
  return pubKeyAny;
}

export const getMsgSendIbc = (from, sourceChannel, to, amount, denom, memo) => {
  const msgSendIbc = new message.ibc.applications.transfer.v1.MsgTransfer({
    source_port: 'transfer',
    source_channel: sourceChannel,
    token: {
      denom,
      amount
    },
    sender: from,
    receiver: to,
    timeout_height: {
      revision_number: '1', // todo
      revision_height: '7000000' // todo
    },
    timeout_timestamp: '0'
  });

  const msgSendIbcAny = new message.google.protobuf.Any({
    type_url: '/ibc.applications.transfer.v1.MsgTransfer',
    value: message.ibc.applications.transfer.v1.MsgTransfer.encode(msgSendIbc).finish()
  });

  return new message.cosmos.tx.v1beta1.TxBody( { messages: [ msgSendIbcAny ], memo } )
}

export const getMsgSendTx = (from, to, amount, denom, memo) => {

  const msgSend = new message.cosmos.bank.v1beta1.MsgSend({
    from_address: from,
    to_address: to,
    amount: [{ denom: denom, amount: String(amount) }]
  });

  const msgSendAny = new message.google.protobuf.Any({
    type_url: "/cosmos.bank.v1beta1.MsgSend",
    value: message.cosmos.bank.v1beta1.MsgSend.encode(msgSend).finish()
  });

  return new message.cosmos.tx.v1beta1.TxBody( { messages: [ msgSendAny ], memo: memo } )
}

export const getMsgRegisterBeacon = (moniker, name, owner) => {
  const msgRegisterBeacon = new message.mainchain.beacon.v1.MsgRegisterBeacon({
    moniker, name, owner
  })

  const msgSendAny = new message.google.protobuf.Any({
    type_url: "/mainchain.beacon.v1.MsgRegisterBeacon",
    value: message.mainchain.beacon.v1.MsgRegisterBeacon.encode(msgRegisterBeacon).finish()
  });

  return new message.cosmos.tx.v1beta1.TxBody( { messages: [ msgSendAny ], memo: "" } )
}

export const getMsgRecordBeaconTimestamp = (beaconId, hash, submitTime, owner) => {
  const msgRecordBeaconTimestamp = new message.mainchain.beacon.v1.MsgRecordBeaconTimestamp({
    beacon_id: beaconId,
    hash: hash,
    submit_time: submitTime,
    owner,
  })

  const msgSendAny = new message.google.protobuf.Any({
    type_url: "/mainchain.beacon.v1.MsgRecordBeaconTimestamp",
    value: message.mainchain.beacon.v1.MsgRecordBeaconTimestamp.encode(msgRecordBeaconTimestamp).finish()
  });

  return new message.cosmos.tx.v1beta1.TxBody( { messages: [ msgSendAny ], memo: "" } )
}

export const getMsgRegisterWrkChain = (moniker, name, genesisHash, baseType, owner) => {
  const msgRegisterWrkChain = new message.mainchain.wrkchain.v1.MsgRegisterWrkChain({
    moniker,
    name,
    genesis_hash: genesisHash,
    base_type: baseType,
    owner,
  })

  const msgSendAny = new message.google.protobuf.Any({
    type_url: "/mainchain.wrkchain.v1.MsgRegisterWrkChain",
    value: message.mainchain.wrkchain.v1.MsgRegisterWrkChain.encode(msgRegisterWrkChain).finish()
  });

  return new message.cosmos.tx.v1beta1.TxBody( { messages: [ msgSendAny ], memo: "" } )
}

export const getMsgRecordWrkChainBlock = (wrkchainId, height, blockHash, parentHash, h1, h2, h3, owner) => {
  const msgRecordWrkChainBlock = new message.mainchain.wrkchain.v1.MsgRecordWrkChainBlock({
    wrkchain_id: wrkchainId,
    height,
    block_hash: blockHash,
    parent_hash: parentHash,
    hash1: h1,
    hash2: h2,
    hash3: h3,
    owner,
  })

  const msgSendAny = new message.google.protobuf.Any({
    type_url: "/mainchain.wrkchain.v1.MsgRecordWrkChainBlock",
    value: message.mainchain.wrkchain.v1.MsgRecordWrkChainBlock.encode(msgRecordWrkChainBlock).finish()
  });

  return new message.cosmos.tx.v1beta1.TxBody( { messages: [ msgSendAny ], memo: "" } )
}

export const getMsgDelegate = (delegator, validator, amount, denom, memo) => {
  const msgDelegate = new message.cosmos.staking.v1beta1.MsgDelegate({
    delegator_address: delegator,
    validator_address: validator,
    amount: { denom: denom, amount: String(amount) }
  })

  const msgSendAny = new message.google.protobuf.Any({
    type_url: "/cosmos.staking.v1beta1.MsgDelegate",
    value: message.cosmos.staking.v1beta1.MsgDelegate.encode(msgDelegate).finish()
  });

  return new message.cosmos.tx.v1beta1.TxBody( { messages: [ msgSendAny ], memo: memo } )
}

export const getMsgUndelegate = (delegator, validator, amount, denom, memo) => {
  const msgUndelegate = new message.cosmos.staking.v1beta1.MsgUndelegate({
    delegator_address: delegator,
    validator_address: validator,
    amount: { denom: denom, amount: String(amount) }
  })

  const msgSendAny = new message.google.protobuf.Any({
    type_url: "/cosmos.staking.v1beta1.MsgUndelegate",
    value: message.cosmos.staking.v1beta1.MsgUndelegate.encode(msgUndelegate).finish()
  });

  return new message.cosmos.tx.v1beta1.TxBody( { messages: [ msgSendAny ], memo: memo } )
}

export const getMsgBeginRedelegate = (delegator, validatorFrom, validatorTo, amount, denom, memo) => {
  const msgBeginRedelegate = new message.cosmos.staking.v1beta1.MsgBeginRedelegate({
    delegator_address: delegator,
    validator_dst_address: validatorTo,
    validator_src_address: validatorFrom,
    amount: { denom: denom, amount: String(amount) }
  })

  const msgSendAny = new message.google.protobuf.Any({
    type_url: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
    value: message.cosmos.staking.v1beta1.MsgBeginRedelegate.encode(msgBeginRedelegate).finish()
  });

  return new message.cosmos.tx.v1beta1.TxBody( { messages: [ msgSendAny ], memo: memo } )
}

export const getMsgWithdrawDelegatorReward = (delegator, validator, withCommission = false, memo) => {

  const msgs = []

  const msgWithdrawDelegatorReward = new message.cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward({
    delegator_address: delegator,
    validator_address: validator,
  })

  const msgSendAnyDelegaroeReward = new message.google.protobuf.Any({
    type_url: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
    value: message.cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward.encode(msgWithdrawDelegatorReward).finish()
  });

  msgs.push(msgSendAnyDelegaroeReward)

  if(withCommission) {
    //
    const msgWithdrawValidatorCommission = new message.cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission({
      validator_address: validator,
    })

    const msgSendAnyWithdrawValidatorCommission = new message.google.protobuf.Any({
      type_url: "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission",
      value: message.cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission.encode(msgWithdrawValidatorCommission).finish()
    });

    msgs.push(msgSendAnyWithdrawValidatorCommission)
  }

  return new message.cosmos.tx.v1beta1.TxBody( { messages: msgs, memo: memo } )
}

export const getMsgVote = (proposalId, option, voter, memo) => {
  const op = message.cosmos.gov.v1beta1.VoteOption[option]
  const msgVote = new message.cosmos.gov.v1beta1.MsgVote({
    proposal_id: proposalId,
    option: op,
    voter,
  })

  const msgSendAny = new message.google.protobuf.Any({
    type_url: "/cosmos.gov.v1beta1.MsgVote",
    value: message.cosmos.gov.v1beta1.MsgVote.encode(msgVote).finish()
  });

  return new message.cosmos.tx.v1beta1.TxBody( { messages: [ msgSendAny ], memo: memo } )
}

export const getSignerInfo = (pubKeyAny, sequence) => {
  return new message.cosmos.tx.v1beta1.SignerInfo({
    public_key: pubKeyAny,
    mode_info: { single: { mode: message.cosmos.tx.signing.v1beta1.SignMode.SIGN_MODE_DIRECT } },
    sequence: sequence
  });
}

export const getAuthInfo = (signerInfo, fee) => {
  return  new message.cosmos.tx.v1beta1.AuthInfo({ signer_infos: [signerInfo], fee: fee });
}

export const getFee = (feeAmount, feeDenom, gasLimit) => {
  return new message.cosmos.tx.v1beta1.Fee({
    amount: [{ denom: feeDenom, amount: String(feeAmount) }],
    gas_limit: Number(gasLimit)
  });
}
