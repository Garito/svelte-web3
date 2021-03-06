import WalletLink from 'walletlink';
import Web3 from 'web3'
import WalletConnectProvider from "@walletconnect/web3-provider";

import { derived, writable } from 'svelte/store'

// https://chainid.network/chains.json
import chains from './chains.json'

export const web3utils = Web3.utils

const connection = writable({provider: null, accounts: []})
const state = writable({})

const chain = id => {
  if (!id) return {}
  if (web3utils.isHexStrict(id)) id = web3utils.hexToNumber(id)
  for (const def of chains) {
    if (def.chainId === id) return def
  }
  return {}
}

const chainIdHeuristic = ({ chainId, networkVersion }) => {
  if (chainId !== '0xNaN') return chainId;
  return chain(networkVersion).chainId;
}

export const ethereum = {
  setProvider: async provider => {
    // console.log('web3.js connection, setting provider', provider)
    connection.set({
      provider,
      providerType: 'HTTP', // better self discovery
      //chainId: chainIdHeuristic(provider),
      accounts: [],
    })
  },
  setBrowserProvider: async () => {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    // console.log('web3.js connection, set provider using window.ethereum', window.ethereum)
    connection.set({
      provider: window.ethereum,
      providerType: 'Browser',
      chainId: chainIdHeuristic(window.ethereum),
      accounts
    })
    if (window.ethereum.isMetaMask) {
      window.ethereum.autoRefreshOnNetworkChange = false
      window.ethereum.on('accountsChanged', ethereum.onAccountsChanged)
      // window.ethereum.on('chainChanged', ethereum.onChainChanged)
      window.ethereum.on('chainChanged', networkId => {
        // handle the new networt - simulate new API
        // console.log('network has changed to', chainId)
        ethereum.onChainChanged(web3utils.toHex(networkId));
      })
    }
  },
  setWalletConnectProvider: async key => {
    const provider = new WalletConnectProvider({ infuraId: key });

    await provider.enable();
    connection.set({
      provider,
      providerType: 'Walletconnect',
      chainId: provider.chainId,
      accounts: provider.accounts
    });

    provider.on('disconnect', () => { ethereum.disconnect(); });

    provider.on('accountsChanged', ethereum.onAccountsChanged);
    provider.on('chainChanged', networkId => { ethereum.onChainChanged(web3utils.toHex(networkId)); });
  },
  setWalletLinkProvider: async key => {
    const walletlink = new WalletLink({
      appName: 'Molekulon3 Tests',
      appLogoUrl: 'https://i.ibb.co/tDNKvyt/logo.gif',
      darkMode: true
    });

    const accounts = await walletlink.send('eth_requestAccounts');

    const provider = walletlink.makeWeb3Provider(`https://mainnet.infura.io/v3/${ key }`, 1);
    console.log(provider);
    connection.set({
      provider,
      providerType: 'Walletlink',
      chainId: provider.chainId,
      accounts
    });
  },
  onAccountsChanged: accounts => connection.update(c => ({...c, accounts})),
  onChainChanged: chainId => connection.update(c => ({...c, chainId})),
  loadProviderState: async (instance) => {
    instance.eth.net.getId((err, networkId) => {
      if (!err) state.update(s => ({...s, networkId}))
    })
    instance.eth.net.isListening((err, isListening) => {
      if (!err) state.update(s => ({...s, isListening}))
    })
  },
  disconnect: () => {
    connection.set({ provider: null, accounts: [] });
    state.set({});
  }
}

export const providerType = derived(connection, $connection => $connection.providerType)
export const shortName = derived(connection, $connection => chain($connection.chainId).shortName)
export const network = derived(connection, $connection => chain($connection.chainId).network)
export const chainId = derived(connection, $connection => $connection.chainId)
export const chainChain = derived(connection, $connection => chain($connection.chainId).chain)
export const chainName = derived(connection, $connection => chain($connection.chainId).name)
export const nativeCurrency = derived(connection, $connection => chain($connection.chainId).nativeCurrency)

export const walletType = derived(connection, $connection => {
  if (!$connection.provider) return null
  if (typeof $connection.provider === 'string') return $connection.provider
  if ($connection.provider.isMetaMask) return 'MetaMask (or compatible)'
  if ($connection.provider.isNiftyWallet) return 'Nifty'
  if ($connection.provider.isTrust) return 'Trust'
  return 'Unknown'
});

export const isListening = derived(state, $state => $state.isListening || false)

export const selectedAccount = derived(
  connection, $connection => $connection.accounts.length ? $connection.accounts[0] : null
)

export const web3 = derived(
  connection,
  $connection => {
    if (!$connection.provider) return {};
    const instance = new Web3($connection.provider)
    // console.log('web3 instance ready', instance)
    ethereum.loadProviderState(instance)
    return instance
  }
)

export const whenReady = (...args) => {
  const fn = args.pop();
  for (const arg of args) {
    if (!arg) return Promise.reject(new Error('not valid'))
  }
  /// check fn is a fn
  return fn(...args);
}
