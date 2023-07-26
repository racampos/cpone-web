import { fetchAccount, PublicKey, Field, Signature, Bool } from 'snarkyjs';

import type {
  ZkappWorkerRequest,
  ZkappWorkerReponse,
  WorkerFunctions,
} from './zkappWorker';

export default class ZkappWorkerClient {
  // ---------------------------------------------------------------------------------------

  setActiveInstanceToBerkeley() {
    return this._call('setActiveInstanceToBerkeley', {});
  }

  loadContract() {
    return this._call('loadContract', {});
  }

  compileContract() {
    return this._call('compileContract', {});
  }

  fetchAccount({
    publicKey,
  }: {
    publicKey: PublicKey;
  }): ReturnType<typeof fetchAccount> {
    const result = this._call('fetchAccount', {
      publicKey58: publicKey.toBase58(),
    });
    return result as ReturnType<typeof fetchAccount>;
  }

  initZkappInstance(publicKey: PublicKey) {
    return this._call('initZkappInstance', {
      publicKey58: publicKey.toBase58(),
    });
  }

  async getNftHash(): Promise<Field> {
    const result = await this._call('getNftHash', {});
    return Field.fromJSON(JSON.parse(result as string));
  }

  async getEndorserHash(): Promise<Field> {
    const result = await this._call('getEndorserHash', {});
    return Field.fromJSON(JSON.parse(result as string));
  }

  async getOraclePublicKey(): Promise<PublicKey> {
    const result = await this._call('getOraclePublicKey', {});
    return PublicKey.fromJSON(JSON.parse(result as string));
  }

  async getIsEndorsed(): Promise<Bool> {
    const result = await this._call('getIsEndorsed', {});
    return Bool.fromJSON(JSON.parse(result as string));
  }

  createVerifyTransaction(nftHash: Field, endorserHash: Field, signature: Signature) {
    return this._call('createVerifyTransaction', { nftHash, endorserHash, signature });
  }

  proveVerifyTransaction() {
    return this._call('proveVerifyTransaction', {});
  }

  async getTransactionJSON() {
    const result = await this._call('getTransactionJSON', {});
    return result;
  }

  // ---------------------------------------------------------------------------------------

  worker: Worker;

  promises: {
    [id: number]: { resolve: (res: any) => void; reject: (err: any) => void };
  };

  nextId: number;

  constructor() {
    this.worker = new Worker(new URL('./zkappWorker.ts', import.meta.url));
    this.promises = {};
    this.nextId = 0;

    this.worker.onmessage = (event: MessageEvent<ZkappWorkerReponse>) => {
      this.promises[event.data.id].resolve(event.data.data);
      delete this.promises[event.data.id];
    };
  }

  _call(fn: WorkerFunctions, args: any) {
    return new Promise((resolve, reject) => {
      this.promises[this.nextId] = { resolve, reject };

      const message: ZkappWorkerRequest = {
        id: this.nextId,
        fn,
        args,
      };

      this.worker.postMessage(message);

      this.nextId++;
    });
  }
}
