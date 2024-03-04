import { Injectable } from '@nestjs/common';
import { Horizon, Networks } from 'stellar-sdk';

export enum StellarNetwork {
  TESTNET = 'testnet',
  PUBNET = 'pubnet',
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

export const configNetworks = {
  [StellarNetwork.PUBNET]: pubnet,
  [StellarNetwork.TESTNET]: testnet,
};

@Injectable()
export class StellarConfig {
  public network: StellarConfigNetwork;
  public server: Horizon.Server;

  constructor() {
    const STELLAR_NETWORK = process.env.STELLAR_NETWORK;
    this.network = configNetworks[STELLAR_NETWORK];
    this.server = new Horizon.Server(this.network.url);
  }
}
