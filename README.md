[![npm version](http://img.shields.io/npm/v/@unification-com/und-js-v2.svg?style=flat)](https://npmjs.org/package/@unification-com/und-js-v2 "View this project on npm")


# und-js-v2

The FUND Javascript SDK supporting Cosmos SDK `stargate` (>= v0.42.x)

## Prerequisites

NodeJS >=14.0.0 required. See `.nvmrc`

## Usage

Install:

```bash
yarn add @unification-com/und-js-v2
```

Import into your project:

```javascript
const { UndClient } = require("@unification-com/und-js-v2")

const fund = new UndClient("http://localhost:1317")
await fund.initChain()
const privKey = UndClient.crypto.getPrivateKeyFromMnemonic("mnemonic")
await fund.setPrivateKey(privKey)

fund.getBalance().then(response => console.log(response))
```

See [examples]("./example/fund.js) and [jsdoc]("./doc/jsdoc.md)

## Development

Proto Javascript can be regenerated using the script:

```bash
./gen-proto.sh
```

This is required, for example, when proto definitions change for Cosmos SDK, Tendermint, Mainchain etc.

`proto.js` needs a slight tweak after the script runs:

```javascript
// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});
```
