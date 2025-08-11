import { notifications } from "@mantine/notifications";

export interface ErrorDetails {
  code?: string | number;
  message: string;
  details?: string;
  suggestion?: string;
  retryable?: boolean;
}

export function parseBlockchainError(error: any): ErrorDetails {
  // Handle Viem errors
  if (error?.name === "TransactionExecutionError") {
    return {
      code: "TRANSACTION_EXECUTION_ERROR",
      message: "Transaction failed to execute",
      details: error.message,
      suggestion: "Check your wallet balance and gas fees, then try again",
      retryable: true
    };
  }

  if (error?.name === "UserRejectedRequestError") {
    return {
      code: "USER_REJECTED",
      message: "Transaction was rejected by user",
      details: "You cancelled the transaction in your wallet",
      suggestion: "Try again and approve the transaction in your wallet",
      retryable: true
    };
  }

  if (error?.name === "InsufficientFundsError") {
    return {
      code: "INSUFFICIENT_FUNDS",
      message: "Insufficient funds for transaction",
      details: error.message,
      suggestion: "Add more funds to your wallet or reduce the transaction amount",
      retryable: false
    };
  }

  if (error?.name === "ContractFunctionExecutionError") {
    return {
      code: "CONTRACT_ERROR",
      message: "Smart contract execution failed",
      details: error.message,
      suggestion: "The contract may have rejected the transaction. Check if you have sufficient allowance and balance.",
      retryable: true
    };
  }

  // Handle RPC errors
  if (error?.message?.includes("eth_getTransactionCount")) {
    return {
      code: "RPC_ERROR",
      message: "Network connection issue",
      details: "Failed to get transaction count from the network",
      suggestion: "Check your internet connection and try again. If the issue persists, try switching networks.",
      retryable: true
    };
  }

  if (error?.message?.includes("nonce")) {
    return {
      code: "NONCE_ERROR",
      message: "Transaction nonce issue",
      details: error.message,
      suggestion: "Try refreshing your wallet or wait a moment before retrying",
      retryable: true
    };
  }

  if (error?.message?.includes("gas")) {
    return {
      code: "GAS_ERROR",
      message: "Gas estimation failed",
      details: error.message,
      suggestion: "Try increasing gas limit or check if the network is congested",
      retryable: true
    };
  }

  // Handle API errors
  if (error?.status === 429) {
    return {
      code: "RATE_LIMIT",
      message: "Rate limit exceeded",
      details: "Too many requests to the API",
      suggestion: "Wait a moment before trying again",
      retryable: true
    };
  }

  if (error?.status >= 500) {
    return {
      code: "SERVER_ERROR",
      message: "Server error",
      details: `Server returned error ${error.status}`,
      suggestion: "The service is temporarily unavailable. Please try again later.",
      retryable: true
    };
  }

  // Handle network errors
  if (error?.message?.includes("fetch")) {
    return {
      code: "NETWORK_ERROR",
      message: "Network connection failed",
      details: error.message,
      suggestion: "Check your internet connection and try again",
      retryable: true
    };
  }

  // Default error
  return {
    code: "UNKNOWN_ERROR",
    message: "An unexpected error occurred",
    details: error?.message || "Unknown error",
    suggestion: "Please try again. If the problem persists, contact support.",
    retryable: true
  };
}

export function showErrorNotification(error: any, title?: string) {
  const errorDetails = parseBlockchainError(error);
  
  notifications.show({
    title: title || "Error",
    message: (
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{errorDetails.message}</div>
        {errorDetails.details && (
          <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: 4 }}>
            {errorDetails.details}
          </div>
        )}
        {errorDetails.suggestion && (
          <div style={{ fontSize: '0.875rem', color: '#0066cc' }}>
            💡 {errorDetails.suggestion}
          </div>
        )}
      </div>
    ),
    color: "red",
    autoClose: 8000,
  });

  return errorDetails;
}

export function showSuccessNotification(message: string, title?: string) {
  notifications.show({
    title: title || "Success",
    message,
    color: "green",
    autoClose: 4000,
  });
}

export function showWarningNotification(message: string, title?: string) {
  notifications.show({
    title: title || "Warning",
    message,
    color: "orange",
    autoClose: 6000,
  });
}

export function showInfoNotification(message: string, title?: string) {
  notifications.show({
    title: title || "Info",
    message,
    color: "blue",
    autoClose: 5000,
  });
}

// Retry utility for failed operations
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const errorDetails = parseBlockchainError(error);
      
      if (!errorDetails.retryable || attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
      
      // Show retry notification
      showInfoNotification(
        `Retrying operation (${attempt}/${maxRetries})...`,
        "Retry"
      );
    }
  }
  
  throw lastError;
}
