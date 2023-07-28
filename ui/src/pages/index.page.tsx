import { useEffect, useState } from 'react';
import './reactCOIServiceWorker';
import ZkappWorkerClient from './zkappWorkerClient';
import { PublicKey, Field, CircuitString, Poseidon, Signature, Bool } from 'snarkyjs';
import GradientBG from '../components/GradientBG.js';
import styles from '../styles/Home.module.css';


let transactionFee = 0.1;

export default function Home() {
  const [state, setState] = useState({
    zkappWorkerClient: null as null | ZkappWorkerClient,
    hasWallet: null as null | boolean,
    hasBeenSetup: false,
    accountExists: false,
    currentIsEndorsed: null as null | Bool,
    currentNftHash: null as null | Field,
    currentEndorserHash: null as null | Field,
    publicKey: null as null | PublicKey,
    zkappPublicKey: null as null | PublicKey,
    creatingTransaction: false,
  });

  const [displayText, setDisplayText] = useState('');
  const [transactionlink, setTransactionLink] = useState('');

  // -------------------------------------------------------
  // Do Setup

  useEffect(() => {
    async function timeout(seconds: number): Promise<void> {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, seconds * 1000);
      });
    }

    (async () => {
      if (!state.hasBeenSetup) {
        setDisplayText('Loading web worker...');
        console.log('Loading web worker...');
        const zkappWorkerClient = new ZkappWorkerClient();
        await timeout(5);

        setDisplayText('Done loading web worker');
        console.log('Done loading web worker');

        await zkappWorkerClient.setActiveInstanceToBerkeley();

        const mina = (window as any).mina;

        if (mina == null) {
          setState({ ...state, hasWallet: false });
          return;
        }

        const publicKeyBase58: string = (await mina.requestAccounts())[0];
        const publicKey = PublicKey.fromBase58(publicKeyBase58);

        console.log(`Using key:${publicKey.toBase58()}`);
        setDisplayText(`Using key:${publicKey.toBase58()}`);

        setDisplayText('Checking if fee payer account exists...');
        console.log('Checking if fee payer account exists...');

        const res = await zkappWorkerClient.fetchAccount({
          publicKey: publicKey!,
        });
        const accountExists = res.error == null;

        await zkappWorkerClient.loadContract();

        console.log('Compiling zkApp...');
        setDisplayText('Compiling zkApp...');
        await zkappWorkerClient.compileContract();
        console.log('zkApp compiled');
        setDisplayText('zkApp compiled...');

        const zkappPublicKey = PublicKey.fromBase58(
          'B62qppTiiDkw53bewfqwnxGVzH2xW6oGTzGxBouUxeXWVdVTWVkB2rF' //berkeley9
        );

        await zkappWorkerClient.initZkappInstance(zkappPublicKey);

        console.log('Getting zkApp state...');
        setDisplayText('Getting zkApp state...');
        await zkappWorkerClient.fetchAccount({ publicKey: zkappPublicKey });
        const currentIsEndorsed = await zkappWorkerClient.getIsEndorsed();
        console.log(`The NFT is endorsed: ${currentIsEndorsed.toString()}`);
        setDisplayText(`The NFT is endorsed: ${currentIsEndorsed.toString()}`);
        const currentOraclePublicKey = await zkappWorkerClient.getOraclePublicKey();
        console.log(`Oracle public key: ${currentOraclePublicKey.toString()}`);
        const currentNftHash = await zkappWorkerClient.getNftHash();
        console.log(`NFT hash: ${currentNftHash.toString()}`);
        const currentEndorserHash = await zkappWorkerClient.getEndorserHash();
        console.log(`Endorser hash: ${currentEndorserHash.toString()}`);

        setState({
          ...state,
          zkappWorkerClient,
          hasWallet: true,
          hasBeenSetup: true,
          publicKey,
          zkappPublicKey,
          accountExists,
          currentIsEndorsed,
          currentNftHash,
          currentEndorserHash
        });
      }
    })();
  }, []);

  // -------------------------------------------------------
  // Wait for account to exist, if it didn't

  useEffect(() => {
    (async () => {
      if (state.hasBeenSetup && !state.accountExists) {
        for (;;) {
          setDisplayText('Checking if fee payer account exists...');
          console.log('Checking if fee payer account exists...');
          const res = await state.zkappWorkerClient!.fetchAccount({
            publicKey: state.publicKey!,
          });
          const accountExists = res.error == null;
          if (accountExists) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        setState({ ...state, accountExists: true });
      }
    })();
  }, [state.hasBeenSetup]);

  // -------------------------------------------------------
  // Send a transaction

  const onSendTransaction = async () => {
    setState({ ...state, creatingTransaction: true });

    setDisplayText('Retrieving data from oracle...');
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

    setDisplayText('Verifying NFT endorsement...');
    console.log('Verifying NFT endorsement...');

    await state.zkappWorkerClient!.fetchAccount({
      publicKey: state.publicKey!,
    });

    // await state.zkappWorkerClient!.createVerifyTransaction(nftHash, endorserHash, signature);

    await state.zkappWorkerClient!.createUpdateNftHashTransaction();

    setDisplayText('Creating proof...');
    console.log('Creating proof...');
    // await state.zkappWorkerClient!.proveVerifyTransaction();
    await state.zkappWorkerClient!.proveUpdateNftHashTransaction();

    
    console.log('Requesting send transaction...');
    setDisplayText('Requesting send transaction...');
    const transactionJSON = await state.zkappWorkerClient!.getTransactionJSON();

    setDisplayText('Getting transaction JSON...');
    console.log('Getting transaction JSON...');
    const { hash } = await (window as any).mina.sendTransaction({
      transaction: transactionJSON,
      feePayer: {
        fee: transactionFee,
        memo: '',
      },
    });

    const transactionLink = `https://berkeley.minaexplorer.com/transaction/${hash}`;
    console.log(`View transaction at ${transactionLink}`);

    setTransactionLink(transactionLink);
    setDisplayText(transactionLink);

    setState({ ...state, creatingTransaction: false });
  };

  // -------------------------------------------------------
  // Refresh the current state

  const onRefreshCurrentValue = async () => {
    console.log('Getting zkApp state...');
    setDisplayText('Getting zkApp state...');

    await state.zkappWorkerClient!.fetchAccount({
      publicKey: state.zkappPublicKey!,
    });
    const currentIsEndorsed = await state.zkappWorkerClient!.getIsEndorsed();
    setState({ ...state, currentIsEndorsed });
    console.log(`The NFT is endorsed:  ${currentIsEndorsed.toString()}`);

    const currentNftHash = await state.zkappWorkerClient!.getNftHash();
    setState({ ...state, currentNftHash });
    console.log(`NFT hash: ${currentNftHash.toString()}`);

    const currentEndorserHash = await state.zkappWorkerClient!.getEndorserHash();
    setState({ ...state, currentEndorserHash });
    console.log(`Endorser hash: ${currentEndorserHash.toString()}`);

    const currentOraclePublicKey = await state.zkappWorkerClient!.getOraclePublicKey();
    console.log(`Oracle public key:`);
    console.log(currentOraclePublicKey);


    setDisplayText('');
  };

  // -------------------------------------------------------
  // Create UI elements

  let hasWallet;
  if (state.hasWallet != null && !state.hasWallet) {
    const auroLink = 'https://www.aurowallet.com/';
    const auroLinkElem = (
      <a href={auroLink} target="_blank" rel="noreferrer">
        [Link]{' '}
      </a>
    );
    hasWallet = (
      <div>
        Could not find a wallet. Install Auro wallet here: {auroLinkElem}
      </div>
    );
  }

  const stepDisplay = transactionlink ? (
    <a href={displayText} target="_blank" rel="noreferrer">
      View transaction
    </a>
  ) : (
    displayText
  );

  let setup = (
    <div
      className={styles.start}
      style={{ fontWeight: 'bold', fontSize: '1.5rem', paddingBottom: '5rem' }}
    >
      {stepDisplay}
      {hasWallet}
    </div>
  );

  let accountDoesNotExist;
  if (state.hasBeenSetup && !state.accountExists) {
    const faucetLink =
      'https://faucet.minaprotocol.com/?address=' + state.publicKey!.toBase58();
    accountDoesNotExist = (
      <div>
        Account does not exist. Please visit the faucet to fund this account
        <a href={faucetLink} target="_blank" rel="noreferrer">
          [Link]{' '}
        </a>
      </div>
    );
  }

  let mainContent;
  if (state.hasBeenSetup && state.accountExists) {
    mainContent = (
      <div style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className={styles.center} style={{ padding: 0 }}>
          The NFT is endorsed: {state.currentIsEndorsed!.toString()}{' '}
        </div>
        <button
          className={styles.card}
          onClick={onSendTransaction}
          disabled={state.creatingTransaction}
        >
          Send Transaction
        </button>
        <button className={styles.card} onClick={onRefreshCurrentValue}>
          Get Latest State
        </button>
      </div>
    );
  }

  return (
    <GradientBG>
      <div className={styles.main} style={{ padding: 0 }}>
        <div className={styles.center} style={{ padding: 0 }}>
          {setup}
          {accountDoesNotExist}
          {mainContent}
        </div>
      </div>
    </GradientBG>
  );
}
