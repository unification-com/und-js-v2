require("dotenv").config()
// The mnemonic for the DevNet node1 account can be used for testing
// see https://github.com/unification-com/mainchain/tree/master/Docker
const mnemonic = process.env.MNEMONIC;
const denomFund = "fund"
const amountFund = 2.00177011

const targetAddress = "und150xrwj6ca9kyzz20e4x0qj6zm0206jhe4tk7nf"
const valAddress = "undvaloper1eq239sgefyzm4crl85nfyvt7kw83vrna6lrjet"
const redelValAddress = "undvaloper13lyhcfekkdczaugqaexya60ckn23l5wazf07px"

let fee = {
	"denom": "nund",
	"amount": "25000000",
	"gas": "200000"
}

let delFee = {
	"denom": "nund",
	"amount": "250000000",
	"gas": "1000000"
}

const getUndClient = async () => {
	const UndClient = await import("../lib/index.js")
	return UndClient.default.UndClient
}

async function run() {

	const UndClient = await getUndClient()
	// DevNet
	const fund = new UndClient("http://localhost:1317");
	// TestNet
	// const fund = new UndClient("https://rest-testnet.unification.io");

	await fund.initChain()
	// get only the private key from a mnemonic. It is also possible use the recoverAccountFromMnemonic
	// function to get more data, such as the wallet address and HD path (see further below for examples).
	const privKey = UndClient.crypto.getPrivateKeyFromMnemonic(mnemonic)

	// set key using the returned Buffer
	await fund.setPrivateKey(privKey)

	// key can also be set as a hex string
	// await fund.setPrivateKey(privKey.toString("hex"))

	// Mnemonics and keys can be generated, this will return
	// - a new nmemonic
	// - private key in Buffer and hex string for acc 0
	// - the wallet address
	// const newAcc = fund.createAccountWithMneomnic()
	// console.log(newAcc)
	// await fund.setPrivateKey(newAcc.privateKey)
	// const pubK = fund.getPubKeyAny()
	// console.log(pubK)

	// Account data can be also be recovered from a mnemonic, this will return
	// - private key in Buffer and hex string for given account index (default is 0)
	// - the wallet address
	// const recAcc0 = fund.recoverAccountFromMnemonic(mnemonic)
	// const recAcc1 = fund.recoverAccountFromMnemonic(mnemonic, 1)
	// console.log(recAcc0)
	// console.log(recAcc1)
	// await fund.setPrivateKey(recAcc0.privateKey)
	//
	// const pubK = fund.getPubKeyAny()
	// console.log(pubK)

	// fund.transferUnd(targetAddress, amountFund, fee, denomFund).then(response => console.log(response));
	// fund.registerBeacon("testb1", "Test B1").then(response => console.log(response));
	// fund.recordBeaconTimestamp(1, "somehash1", 12345).then(response => console.log(response));
	// fund.registerWRKChain("wrkc1", "geth", "WC Test 1", "genesishash").then(response => console.log(response));
	// fund.recordWRKChainBlock(1, 24, "blockyhashy", "parentyhashy", "h1", "h2", "h3").then(response => console.log(response));
	// fund.delegate(valAddress, 12345.6789, delFee, "fund").then(response => console.log(response));
	// fund.undelegate(valAddress, 10, delFee, "fund").then(response => console.log(response));
	// fund.redelegate(valAddress, redelValAddress,10, delFee, "fund").then(response => console.log(response));
	// fund.withdrawDelegationReward(valAddress, delFee, true).then(response => console.log(response));
	// fund.getBalance().then(response => console.log(response));
	// fund.getTransactions('und15s4ec3s97tu4pstk8tq86l5ues4dxnmadqmrjl').then(response => console.log(response));
	// fund.getTransactionsReceived().then(response => console.log(response));

	// first, submit a proposal using the und cli, e.g.
	/*
	und tx gov submit-proposal \
	     --deposit=10000000000000nund \
	     --description="test proposal" \
	     --title="Test" \
	     --type="text" \
	     --node=http://localhost:26661 \
	     --chain-id=FUND-Mainchain-DevNet \
	     --from=node1 \
	     --gas=auto \
	     --gas-adjustment=1.5 \
	     --gas-prices=0.25nund
	 */

	// fund.getGovernanceProposals().then(response => console.log(response));
	// fund.getGovernanceProposalVotes(1).then(response => console.log(response));
	// fund.getGovernanceProposalTally(1).then(response => console.log(response));
	// fund.voteOnProposal(1, "VOTE_OPTION_YES", delFee).then(response => console.log(response));

	// fund.getTx("4FAD8BE176BAA072EF10E5F8CEFB2834B90156AFC89B3F284036677A672D6C3D").then(response => console.log(response));
	// fund.getDelegations().then(response => console.log(response));
	// fund.getUnbondingDelegations().then(response => console.log(response));
	// fund.getDelegatorRewards().then(response => console.log(response));
	// fund.getDelegatorWithdrawAddress().then(response => console.log(response));
	// fund.getValidators().then(response => console.log(response));
	// fund.getRedelegations().then(response => console.log(response));
	// fund.getValidatorCommission(valAddress).then(response => console.log(response));
	// fund.getTotalSupply().then(response => console.log(response));
}

run().then()
