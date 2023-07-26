/**
 *
 * To run locally:
 * Build the project: `$ npm run build`
 * Run with node:     `$ node build/src/deploy.js <network>`.
 */
import { Mina, PrivateKey, CircuitString, Poseidon, Field, Signature } from 'snarkyjs';
import fs from 'fs/promises';
import { Cpone } from './Cpone';
import crypto from 'crypto';

// check command line arg
let network = process.argv[2];
let feepayerKeyPath = "/Users/rcampos/.cache/zkapp-cli/keys/auro-c3p2.json"
if (!network)
  throw Error(`Missing <network> argument.

Usage:
node build/src/interact.js <network>

Example:
node build/src/interact.js berkeley
`);
Error.stackTraceLimit = 1000;


// parse config and private key from file
type Config = { deployAliases: Record<string, { url: string; keyPath: string }> };
let configJson: Config = JSON.parse(await fs.readFile('config.json', 'utf8'));


let config = configJson.deployAliases[network];
let key: { privateKey: string } = JSON.parse(
  await fs.readFile(config.keyPath, 'utf8')
);
let zkAppKey = PrivateKey.fromBase58(key.privateKey);

let feepayerKeyPair :{ privateKey: string } = JSON.parse(
  await fs.readFile(feepayerKeyPath, 'utf8')
);

let feepayerPrivateKey = PrivateKey.fromBase58(feepayerKeyPair.privateKey)
let feepayerPublicKey = feepayerPrivateKey.toPublicKey()

// compile the contract to create prover keys
console.log('compile the contract...');
let { verificationKey } = await Cpone.compile();

// set up Mina instance and contract we interact with
const Network = Mina.Network(config.url);
Mina.setActiveInstance(Network);
let zkAppAddress = zkAppKey.toPublicKey();
let zkApp = new Cpone(zkAppAddress);


console.log('Retrieving data from oracle...');

const endorserUsername = 'mathy782'; // TODO: Replace hardcoded value with input from UI
const response = await fetch(
  `https://cpone-oracle-aa6cba0bb20a.herokuapp.com/getLatestTweet/${endorserUsername}`
);
const data = await response.json();
const nftHash = Field(data.signedData.nftPoseidonHash);
const endorserHash = Field(data.signedData.endorserHash);
const signature = Signature.fromJSON(data.signature);

console.log(`nftHash: ${nftHash}`);
console.log(`endorserHash: ${endorserHash}`);
console.log(`signature: ${signature}`);

console.log('Verifying NFT endorsement...');

const tx = await Mina.transaction({ sender: feepayerPublicKey, fee: 0.1e9 }, () => {
    zkApp.verify(
      nftHash,
      endorserHash,
      signature ?? fail('something is wrong with the signature')
  );
});
await tx.prove();
console.log('sending transaction...');
let sentTx = await tx.sign([feepayerPrivateKey]).send();


// call update() and send transaction
// console.log('build transaction and create proof...');
// let tx = await Mina.transaction({ sender: feepayerPublicKey, fee: 0.1e9 }, () => {
//   zkApp.setNftHash(nftHash);
//   zkApp.setEndorserHash(endorserHash);
// });
// await tx.prove();
// console.log('sending transaction...');
// let sentTx = await tx.sign([feepayerPrivateKey]).send();

if (sentTx.hash() !== undefined) {
  console.log(`
Success! Transaction sent.

Your smart contract update will take effect
as soon as the transaction is included in a block:
https://berkeley.minaexplorer.com/transaction/${sentTx.hash()}
`);
}
