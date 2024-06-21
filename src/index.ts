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


const phrase = ''; // 12 words phrase
const amountIn = 0.1;
const assetIn = 'USDT';
const assetInDecimals = 18;
const assetOut = 'ORN';
const minReturnPercent = 0.99;


(async () => {
  const {
    exchangeContractAddress,
    assetToAddress,
    swapExecutorContractAddress,
  } = await fetch(`${API_URL}/api/info`).then(o => o.json());

  const provider = new JsonRpcProvider(rpcUrl);
  const chainId = await provider.getNetwork().then(o => o.chainId);
  const gasPriceWei = await fetch(`${API_URL}/api/gasPrice`).then(o => o.json());


  const wallet = Wallet.fromPhrase(phrase, provider);
  console.log('wallet', wallet.address);

  const assetInAddress = assetToAddress[assetIn];
  console.log('increasing allowance to exchange contract...');
  {
    const erc20 = ERC20__factory.connect(assetInAddress, wallet);
    const amount = parseUnits(amountIn.toFixed(assetInDecimals), assetInDecimals).toString();
    await erc20.approve(exchangeContractAddress, amount);
  }


  const swapInfo: SwapInfo = await fetch(`${API_URL}/backend/api/v1/swap?amountIn=${amountIn}&assetOut=${assetOut}&assetIn=${assetIn}&exchanges=pools`).then(res => res.json());
  console.log('swapInfo', swapInfo);


  const { amountOut } = swapInfo;
  const minReturnAmount = amountOut * minReturnPercent;

  const swapRequest: DirectSwapRequest = {
    amount: parseUnits(amountIn.toFixed(DECIMALS), DECIMALS).toString(),
    minReturnAmount: parseUnits(minReturnAmount.toFixed(DECIMALS), DECIMALS).toString(),
    receiverAddress: wallet.address,
    path: swapInfo.exchangeContractPath,
  };
  console.log('swapRequest', swapRequest);


  const swapResponse: DirectSwapResult = await fetch(`${API_URL}/api/trade/generate-swap-calldata`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(swapRequest),
  }).then(res => res.json());
  console.log('swapResponse', swapResponse);


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


  console.log('sending tx...');
  const swapThroughOrionPoolTxResponse = await wallet.sendTransaction(unsignedSwapThroughPoolsTx);
  console.log('tx was sent', swapThroughOrionPoolTxResponse.hash, '| wait for confirmation...')

  await swapThroughOrionPoolTxResponse.wait();
  console.log('success swap');
})();
