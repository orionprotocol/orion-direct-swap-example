1. create new folder for project
```
mkdir orion-direct-swap-example && cd $_
```

2. init package.json
```
pnpm init
```

3. install dependencies
```sh
pnpm i ethers @orionprotocol/contracts
```

4. create main file `src/index.ts`

5. import dependencies. add interfaces and constants
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

6. configure data for swap. set asset to swap.
set your seed phrase. this wallet should have atleast 0.002 BNB for network fees and 0.1 USDT as input asset
```ts
const phrase = ''; // 12 words phrase
const amountIn = 0.1;
const assetIn = 'USDT';
const assetInDecimals = 18;
const assetOut = 'ORN';
const minReturnPercent = 0.99;
```

7. load configuration. setup provider. load network data
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

8. setup wallet and approve Orion exchange contract to spend input asset
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

9. request swap info. it will contain optimal path for swap and estimated output value
```ts
const swapInfo: SwapInfo = await fetch(`${API_URL}/backend/api/v1/swap?amountIn=${amountIn}&assetOut=${assetOut}&assetIn=${assetIn}&exchanges=pools`).then(res => res.json());
console.log('swapInfo', swapInfo);
```

10. build swap request
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

11. generate calldata for swap response
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

12. build transaction
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

13. send transaction and wait for confirmation
```ts
console.log('sending tx...');
const swapThroughOrionPoolTxResponse = await wallet.sendTransaction(unsignedSwapThroughPoolsTx);
console.log('tx was sent', swapThroughOrionPoolTxResponse.hash, '| wait for confirmation...')

await swapThroughOrionPoolTxResponse.wait();
console.log('success swap');
```

14. run example
```sh
tsx src/index.ts
```

PS: full example code is available in repo https://github.com/orionprotocol/orion-direct-swap-example
