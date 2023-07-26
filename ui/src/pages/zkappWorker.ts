import { Mina, PublicKey, fetchAccount, Field, Signature } from 'snarkyjs';

type Transaction = Awaited<ReturnType<typeof Mina.transaction>>;

// ---------------------------------------------------------------------------------------

import type { Cpone } from '../../../contracts/src/Cpone';

const state = {
  Cpone: null as null | typeof Cpone,
  zkapp: null as null | Cpone,
  transaction: null as null | Transaction,
};

// ---------------------------------------------------------------------------------------

const functions = {
  setActiveInstanceToBerkeley: async (args: {}) => {
    const Berkeley = Mina.Network(
      'https://proxy.berkeley.minaexplorer.com/graphql'
    );
    console.log('Berkeley Instance Created');
    Mina.setActiveInstance(Berkeley);
  },
  loadContract: async (args: {}) => {
    const { Cpone } = await import('../../../contracts/build/src/Cpone.js');
    state.Cpone = Cpone;
  },
  compileContract: async (args: {}) => {
    await state.Cpone!.compile();
  },
  fetchAccount: async (args: { publicKey58: string }) => {
    const publicKey = PublicKey.fromBase58(args.publicKey58);
    return await fetchAccount({ publicKey });
  },
  initZkappInstance: async (args: { publicKey58: string }) => {
    const publicKey = PublicKey.fromBase58(args.publicKey58);
    state.zkapp = new state.Cpone!(publicKey);
  },
  getNftHash: async (args: {}) => {
    const currentValue = await state.zkapp!.nftHash.get();
    return JSON.stringify(currentValue.toJSON());
  },
  getEndorserHash: async (args: {}) => {
    const currentValue = await state.zkapp!.endorserHash.get();
    return JSON.stringify(currentValue.toJSON());
  },
  getOraclePublicKey: async (args: {}) => {
    const currentValue = await state.zkapp!.oraclePublicKey.get();
    return JSON.stringify(currentValue.toJSON());
  },
  getIsEndorsed: async (args: {}) => {
    const currentValue = await state.zkapp!.isEndorsed.get();
    return JSON.stringify(currentValue.toJSON());
  },
  createVerifyTransaction: async (args: { nftHash: Field, endorserHash: Field, signature: Signature }) => {
    const transaction = await Mina.transaction(() => {
      state.zkapp!.verify(
        args.nftHash,
        args.endorserHash,
        args.signature
      );
    });
    state.transaction = transaction;
  },
  proveVerifyTransaction: async (args: {}) => {
    await state.transaction!.prove();
  },
  getTransactionJSON: async (args: {}) => {
    return state.transaction!.toJSON();
  },
};

// ---------------------------------------------------------------------------------------

export type WorkerFunctions = keyof typeof functions;

export type ZkappWorkerRequest = {
  id: number;
  fn: WorkerFunctions;
  args: any;
};

export type ZkappWorkerReponse = {
  id: number;
  data: any;
};

if (typeof window !== 'undefined') {
  addEventListener(
    'message',
    async (event: MessageEvent<ZkappWorkerRequest>) => {
      const returnData = await functions[event.data.fn](event.data.args);

      const message: ZkappWorkerReponse = {
        id: event.data.id,
        data: returnData,
      };
      postMessage(message);
    }
  );
}

console.log('Web Worker Successfully Initialized.');
