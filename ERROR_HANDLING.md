# Error Handling Improvements

This document outlines the comprehensive error handling system implemented in the Backtest AI application to provide graceful and detailed error handling for blockchain transactions and API operations.

## Overview

The application now includes a robust error handling system that provides:

- **Detailed error messages** with specific suggestions for resolution
- **Automatic retry logic** for transient failures
- **User-friendly notifications** with actionable advice
- **Progress tracking** for long-running operations
- **Error boundaries** to catch and handle React errors gracefully

## Components

### 1. Error Handling Utilities (`/src/lib/utils/errorHandling.ts`)

#### `parseBlockchainError(error: any): ErrorDetails`

Parses various types of blockchain and API errors and returns structured error information:

```typescript
interface ErrorDetails {
  code?: string | number;
  message: string;
  details?: string;
  suggestion?: string;
  retryable?: boolean;
}
```

**Supported Error Types:**
- Viem transaction errors (TransactionExecutionError, UserRejectedRequestError, etc.)
- RPC errors (eth_getTransactionCount failures, nonce issues, gas estimation)
- API errors (rate limits, server errors)
- Network connectivity issues

#### `showErrorNotification(error: any, title?: string)`

Displays user-friendly error notifications with:
- Clear error message
- Technical details (when relevant)
- Actionable suggestions
- Automatic dismissal after 8 seconds

#### `retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 3, delay: number = 1000)`

Automatically retries failed operations with exponential backoff:

```typescript
const result = await retryOperation(
  () => walletClient.writeContract({...}),
  3,  // max retries
  2000 // initial delay in ms
);
```

### 2. Enhanced Aave Functions (`/src/lib/aave/viem.ts`)

#### `checkAndApproveErc20()`

Enhanced approval function that:
- Checks existing allowance before approving
- Uses retry logic for network calls
- Provides detailed error feedback
- Shows progress notifications

#### `approveErc20()` and `supplyToAave()`

Updated with:
- Comprehensive error handling
- Automatic retries
- Success/failure notifications
- Transaction receipt validation

### 3. UI Components

#### `ErrorBoundary` (`/src/components/ErrorBoundary.tsx`)

Catches React errors and displays a user-friendly error screen with:
- Clear error message
- Retry functionality
- Page refresh option
- Development error details (in dev mode)

#### `StatusCard` (`/src/components/StatusCard.tsx`)

Displays operation status with:
- Progress indicators
- Status types (info, success, warning, error, loading)
- Detailed messages
- Close functionality

#### `LoadingOverlay` (`/src/components/LoadingOverlay.tsx`)

Provides visual feedback during operations with:
- Blurred background overlay
- Loading spinner
- Customizable messages

## Usage Examples

### Basic Error Handling

```typescript
import { showErrorNotification, retryOperation } from "@/lib/utils/errorHandling";

try {
  const result = await retryOperation(
    () => someBlockchainOperation(),
    3,
    1000
  );
} catch (error) {
  showErrorNotification(error, "Operation Failed");
}
```

### Enhanced Aave Operations

```typescript
import { checkAndApproveErc20, supplyToAave } from "@/lib/aave/viem";

// Check allowance and approve if needed
await checkAndApproveErc20(
  publicClient,
  walletClient,
  tokenAddress,
  spenderAddress,
  amount,
  decimals
);

// Supply to Aave with error handling
await supplyToAave(
  publicClient,
  walletClient,
  poolAddress,
  assetAddress,
  amount,
  decimals
);
```

### Status Tracking

```typescript
import StatusCard from "@/components/StatusCard";

const [status, setStatus] = useState("");
const [statusType, setStatusType] = useState<StatusType>("info");
const [progress, setProgress] = useState<number>();

// Update status during operation
setStatus("Processing transaction...");
setStatusType("loading");
setProgress(50);

// Show in UI
{status && (
  <StatusCard
    type={statusType}
    title="Operation Status"
    message={status}
    progress={progress}
    onClose={() => setStatus("")}
  />
)}
```

## Error Types and Handling

### 1. Transaction Errors

**eth_getTransactionCount failures:**
- **Cause:** Network connectivity issues or RPC endpoint problems
- **Handling:** Automatic retry with exponential backoff
- **User Message:** "Network connection issue. Check your internet connection and try again."

**Nonce errors:**
- **Cause:** Transaction nonce mismatch
- **Handling:** Retry after delay
- **User Message:** "Transaction nonce issue. Try refreshing your wallet or wait a moment."

**Gas estimation failures:**
- **Cause:** Network congestion or complex contract interactions
- **Handling:** Retry with increased gas limit
- **User Message:** "Gas estimation failed. Try increasing gas limit or check network congestion."

### 2. Contract Errors

**Insufficient funds:**
- **Cause:** Wallet balance too low
- **Handling:** No retry, show clear message
- **User Message:** "Insufficient funds. Add more funds to your wallet or reduce the amount."

**Contract rejections:**
- **Cause:** Contract logic prevents operation
- **Handling:** Check allowance and balance, retry if appropriate
- **User Message:** "Smart contract execution failed. Check if you have sufficient allowance and balance."

### 3. User Actions

**Transaction rejection:**
- **Cause:** User cancelled in wallet
- **Handling:** Allow retry
- **User Message:** "Transaction was rejected. Try again and approve the transaction in your wallet."

## Best Practices

### 1. Always Use Retry Logic

```typescript
// Good
const result = await retryOperation(() => blockchainCall(), 3, 1000);

// Avoid
const result = await blockchainCall(); // No retry logic
```

### 2. Provide Context in Error Messages

```typescript
// Good
showErrorNotification(error, "Failed to supply USDC to Aave");

// Avoid
showErrorNotification(error, "Error");
```

### 3. Use Progress Indicators for Long Operations

```typescript
setStatus("Processing step 1 of 3...");
setProgress(33);
// ... operation
setStatus("Processing step 2 of 3...");
setProgress(66);
```

### 4. Handle Partial Failures Gracefully

```typescript
for (const asset of assets) {
  try {
    await processAsset(asset);
    completedAssets++;
  } catch (error) {
    showErrorNotification(error, `Failed to process ${asset.symbol}`);
    // Continue with other assets
  }
}
```

## Configuration

### Retry Settings

Default retry configuration:
- **Max retries:** 3
- **Initial delay:** 1000ms
- **Exponential backoff:** Delay doubles after each retry

### Notification Settings

- **Error notifications:** 8 seconds auto-close
- **Success notifications:** 4 seconds auto-close
- **Info notifications:** 5 seconds auto-close
- **Warning notifications:** 6 seconds auto-close

## Testing Error Handling

### Simulating Network Errors

```typescript
// Test retry logic
const mockOperation = jest.fn()
  .mockRejectedValueOnce(new Error("Network error"))
  .mockRejectedValueOnce(new Error("Network error"))
  .mockResolvedValue("success");

const result = await retryOperation(mockOperation, 3, 100);
expect(mockOperation).toHaveBeenCalledTimes(3);
expect(result).toBe("success");
```

### Testing Error Parsing

```typescript
import { parseBlockchainError } from "@/lib/utils/errorHandling";

const error = new Error("eth_getTransactionCount failed");
const details = parseBlockchainError(error);
expect(details.code).toBe("RPC_ERROR");
expect(details.retryable).toBe(true);
```

## Troubleshooting

### Common Issues

1. **Notifications not showing:**
   - Ensure `Notifications` component is mounted in layout
   - Check z-index conflicts

2. **Retry logic not working:**
   - Verify error is retryable (`errorDetails.retryable === true`)
   - Check retry count and delay parameters

3. **Error boundary not catching errors:**
   - Ensure ErrorBoundary wraps the component tree
   - Check for async errors (use try-catch instead)

### Debug Mode

In development mode, error boundaries show detailed error information including:
- Full error stack trace
- Component stack trace
- Error details for debugging

## Future Enhancements

1. **Error Analytics:** Track error patterns and frequency
2. **Smart Retry:** Adaptive retry delays based on error type
3. **Offline Support:** Queue operations when offline
4. **Error Recovery:** Automatic recovery strategies for common errors
5. **User Preferences:** Allow users to configure retry behavior
