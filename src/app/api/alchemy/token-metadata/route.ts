import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Schema for the request body
const schema = z.object({
  contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid contract address format"),
});

// Get Alchemy API key from server environment
function getAlchemyApiKey(): string {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error("ALCHEMY_API_KEY environment variable is required on the server");
  }
  return apiKey;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);

    console.log('Alchemy token metadata API request:', {
      contractAddress: parsed.contractAddress
    });

    const apiKey = getAlchemyApiKey();
    
    // Use Base network for token metadata
    const url = `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;
    
    const payload = {
      jsonrpc: "2.0",
      method: "alchemy_getTokenMetadata",
      params: [parsed.contractAddress],
      id: 1
    };

    console.log(`Fetching token metadata for ${parsed.contractAddress} from Alchemy`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Alchemy API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`Received token metadata:`, data);

    if (data.error) {
      throw new Error(`Alchemy API error: ${data.error.message || 'Unknown error'}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Alchemy token metadata API error:', error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
