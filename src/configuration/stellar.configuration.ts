import { Injectable } from '@nestjs/common';
import { Horizon, Networks } from '@stellar/stellar-sdk';

export enum StellarNetwork {
  TESTNET = 'testnet',
  PUBNET = 'pubnet',
  STANDALONE = 'standalone',
}

type StellarConfigNetwork = {
  url: string;
  passphrase: Networks;
};

const pubnet = {
  url: 'https://horizon.stellar.org',
  passphrase: Networks.PUBLIC,
};

const testnet = {
  url: 'https://horizon-testnet.stellar.org',
  passphrase: Networks.TESTNET,
};

const standalone = {
  url: 'http://localhost:8000',
  passphrase: Networks.STANDALONE,
};

export const configNetworks = {
  [StellarNetwork.PUBNET]: pubnet,
  [StellarNetwork.TESTNET]: testnet,
  [StellarNetwork.STANDALONE]: standalone,
};

@Injectable()
export class StellarConfig {
  public network: StellarConfigNetwork;
  public server: Horizon.Server;

  constructor() {
    const STELLAR_NETWORK = process.env.STELLAR_NETWORK;
    this.network = configNetworks[STELLAR_NETWORK];
    this.server = new Horizon.Server(this.network.url, {
      allowHttp: STELLAR_NETWORK === StellarNetwork.STANDALONE,
    });
  }
}
