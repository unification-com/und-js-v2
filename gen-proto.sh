#!/bin/bash

COSMOS_GH="https://github.com/cosmos/cosmos-sdk.git"
COSMOS_VER="v0.42.11"
MAINCHAIN_GH="https://github.com/unification-com/mainchain.git"
MAINCHAIN_VER="stargate"

TMP_DIR="./tmp"
PROTO_DIR="${TMP_DIR}/proto"
PROTO_THIRD_PARTY_DIR="${TMP_DIR}/proto_thirdparty"

rm -rf "${TMP_DIR}"

mkdir -p "${TMP_DIR}"
mkdir -p "${PROTO_DIR}"
mkdir -p "${PROTO_THIRD_PARTY_DIR}"

git clone -b "${COSMOS_VER}" "${COSMOS_GH}" "${TMP_DIR}"/cosmos-sdk
git clone -b "${MAINCHAIN_VER}" "${MAINCHAIN_GH}" "${TMP_DIR}"/mainchain

cp -r "${TMP_DIR}"/cosmos-sdk/proto/* "${PROTO_DIR}"/
cp -r "${TMP_DIR}"/cosmos-sdk/third_party/proto/* "${PROTO_THIRD_PARTY_DIR}"
cp -r "${TMP_DIR}"/mainchain/proto/* "${PROTO_DIR}"
mv "${PROTO_THIRD_PARTY_DIR}"/tendermint "${PROTO_DIR}"/

proto_dirs=$(find "${PROTO_DIR}" -path -prune -o -name '*.proto' -print0 | xargs -0 -n1 dirname | sort | uniq)
proto_files=()

for dir in $proto_dirs; do
  proto_files=("${proto_files[@]} $(find "${dir}" -maxdepth 1 -name '*.proto')")
done

npx pbjs \
  -o ./src/messages/proto.cjs \
  -t static-module \
  --force-long \
  --keep-case \
  --no-create \
  --path="${PROTO_DIR}" \
  --path="${PROTO_THIRD_PARTY_DIR}" \
  --root="@cosmos-client/core" \
  ${proto_files[@]}

npx pbjs \
  -o ./src/messages/proto.js \
  -t static-module \
  -w es6 \
  --es6 \
  --force-long \
  --keep-case \
  --no-create \
  --path="${PROTO_DIR}" \
  --path="${PROTO_THIRD_PARTY_DIR}" \
  --root="@cosmos-client/core" \
  ${proto_files[@]}

npx pbts \
  -o ./src/messages/proto.d.ts \
  ./src/messages/proto.js

rm -rf "${TMP_DIR}"
