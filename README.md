## Description
Direct swap flow is following:
1. Request best path for swap from asset A to asset B
  - best path can use multiple DEX pools
  - e.g while swapping from asset A to asset B there can be path with better price like A -> other token -> B
2. Generate swap calldata based on best path
3. Make transaction based on calldata and current network conditions
4. Increase allowance for exchange contract
5. Make swap by sending built transaction
6. Exchange contract will execute all swap path atomically and check that you received desired output amount considering selected slippage

## Example

1. Create new folder for project
```
mkdir orion-direct-swap-example && cd $_
```

2. Init package.json
```
pnpm init
```

3. Install dependencies

`ethers` library is used for interaction with blockchain

`@orionprotocol/contracts` contains Orion contracts ABI

```sh
pnpm i ethers @orionprotocol/contracts
```

4. Create main file `src/index.ts`

5. Import dependencies. add interfaces and constants

You need to choose `API_URL` based on your blockchain network.
See list of available networks at section `API_URL` below

You don't need to change `DECIMALS = 8`. It's fixed for Orion internals

```ts
import { Wallet, JsonRpcProvider, parseUnits } from 'ethers';
import { Exchange__factory } from '@orionprotocol/contracts/lib/ethers-v6/factories/Exchange__factory';
import { ERC20__factory } from '@orionprotocol/contracts/lib/ethers-v6/factories/ERC20__factory';

interface SwapInfo {
  exchangeContractPath: any[],
  amountOut: number,
}

interface DirectSwapRequest {
  amount: string,
  minReturnAmount: string,
  receiverAddress: string,
  path: any[],
}

interface DirectSwapResult {
  calldata: string,
  swapDescription: any,
}

const SWAP_THROUGH_ORION_POOL_GAS_LIMIT = 600000;
const rpcUrl = 'https://bsc-dataseed1.binance.org/';
const API_URL = `https://trade.orion.xyz/bsc-mainnet`;
const DECIMALS = 8;
```

6. Configure data for swap. set asset to swap.

Set your seed phrase. this wallet should have atleast 0.002 BNB for network fees
and 0.1 USDT as input asset

`minReturnPercent` is configuring max price slippage
```ts
const phrase = ''; // 12 words phrase
const amountIn = 0.1;
const assetIn = 'USDT';
const assetInDecimals = 18;
const assetOut = 'ORN';
const minReturnPercent = 0.99;
```

7. Load configuration. Setup provider. Load network data

This information will be used later to build transaction
```ts
(async () => {
  const {
    exchangeContractAddress,
    assetToAddress,
    swapExecutorContractAddress,
  } = await fetch(`${API_URL}/api/info`).then(o => o.json());

  const provider = new JsonRpcProvider(rpcUrl);
  const chainId = await provider.getNetwork().then(o => o.chainId);
  const gasPriceWei = await fetch(`${API_URL}/api/gasPrice`).then(o => o.json());

  // ...
})();
```

8. Setup wallet and approve Orion exchange contract to spend input asset
```ts
const wallet = Wallet.fromPhrase(phrase, provider);
console.log('wallet', wallet.address);

const assetInAddress = assetToAddress[assetIn];
console.log('increasing allowance to exchange contract...');
{
  const erc20 = ERC20__factory.connect(assetInAddress, wallet);
  const amount = parseUnits(amountIn.toFixed(assetInDecimals), assetInDecimals).toString();
  await erc20.approve(exchangeContractAddress, amount);
}
```

9. Request swap info. It will contain optimal path for swap and estimated output value

See section `/backend/api/v1/swap` below for details about request parameters
```ts
const swapInfo: SwapInfo = await fetch(`${API_URL}/backend/api/v1/swap?amountIn=${amountIn}&assetOut=${assetOut}&assetIn=${assetIn}&exchanges=pools`).then(res => res.json());
console.log('swapInfo', swapInfo);
```

10. Build swap request based on received best path
```ts
const { amountOut } = swapInfo;
const minReturnAmount = amountOut * minReturnPercent;

const swapRequest: DirectSwapRequest = {
  amount: parseUnits(amountIn.toFixed(DECIMALS), DECIMALS).toString(),
  minReturnAmount: parseUnits(minReturnAmount.toFixed(DECIMALS), DECIMALS).toString(),
  receiverAddress: wallet.address,
  path: swapInfo.exchangeContractPath,
};
console.log('swapRequest', swapRequest);
```

11. Generate calldata for swap response
```ts
const swapResponse: DirectSwapResult = await fetch(`${API_URL}/api/trade/generate-swap-calldata`, {
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(swapRequest),
}).then(res => res.json());
console.log('swapResponse', swapResponse);
```

12. Build transaction based on calldata and current network conditions
```ts
const { swapDescription, calldata } = swapResponse;
const exchangeContract = Exchange__factory.connect(exchangeContractAddress, provider);
const unsignedSwapThroughPoolsTx = await exchangeContract.swap.populateTransaction(
  swapExecutorContractAddress,
  swapDescription,
  new Uint8Array(0),
  calldata,
  {
    value: 0,
  }
);

unsignedSwapThroughPoolsTx.chainId = chainId;
unsignedSwapThroughPoolsTx.gasPrice = BigInt(gasPriceWei);
unsignedSwapThroughPoolsTx.from = wallet.address;
unsignedSwapThroughPoolsTx.gasLimit = BigInt(SWAP_THROUGH_ORION_POOL_GAS_LIMIT);
unsignedSwapThroughPoolsTx.nonce = await provider.getTransactionCount(wallet.address, 'pending');
```

13. Send transaction and wait for confirmation
```ts
console.log('sending tx...');
const swapThroughOrionPoolTxResponse = await wallet.sendTransaction(unsignedSwapThroughPoolsTx);
console.log('tx was sent', swapThroughOrionPoolTxResponse.hash, '| wait for confirmation...')

await swapThroughOrionPoolTxResponse.wait();
console.log('success swap');
```

14. Run example
```sh
tsx src/index.ts
```

PS: full example code is available in repo https://github.com/orionprotocol/orion-direct-swap-example

### API_URL
Available blockchain networks:

- `https://trade.orion.xyz/eth-mainnet`
- `https://trade.orion.xyz/bsc-mainnet`
- `https://trade.orion.xyz/polygon-mainnet`
- `https://trade.orion.xyz/opbnb-mainnet`
- `https://trade.orion.xyz/linea-mainnet`

### /backend/api/v1/swap
Available input parameters:

- amountIn - input amount to swap in decimals - e.g `10.85`
- assetIn - input asset symbol - e.g `USDT`
- assetOut - output asset symbol - e.g `ORN`
- exchanges - configures which kind of exchanges to use DEXes, CEXes or both. Optionals parameter
  - example: `pools`, `cex` or empty string to use both
