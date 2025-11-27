const API_URL = 'https://uzq2msccdm2sczqgr2kseiwuma0jdgav.lambda-url.us-west-2.on.aws/';

interface QueryApiRequest {
  query: string;
  session_id?: string; // Optional session ID for conversation tracking
  channel?: string; // Channel type: 'email', 'sms', or 'whatsapp'
}

interface QueryApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  agent_response?: string; // The response text to send back to the user
  message?: string;
}

/**
 * Formats agent response text by removing odd line breaks and adding meaningful ones
 * @param text - The text to format
 * @returns Formatted text with proper line breaks
 */
export const formatAgentResponse = (text: string): string => {
  if (!text || !text.trim()) {
    return text;
  }

  // Debug: Log original text details
  const originalLineBreaks = (text.match(/\n/g) || []).length;
  const originalPreview = text.substring(0, 300).replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  console.log('formatAgentResponse - Original text:', {
    length: text.length,
    lineBreaks: originalLineBreaks,
    preview: originalPreview,
    hasCarriageReturns: (text.match(/\r/g) || []).length > 0,
  });

  // Step 1: Normalize line endings - convert \r\n and \r to \n
  let formatted = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Step 2: Normalize whitespace - replace multiple spaces/tabs with single space
  formatted = formatted.replace(/[ \t]+/g, ' ');

  // Step 3: Replace multiple consecutive line breaks (3+) with double line break
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  // Step 4: Preserve paragraph breaks (double line breaks) temporarily with a unique marker
  // Use a marker that's unlikely to appear in the text
  const PARA_MARKER = '___PARAGRAPH_BREAK_MARKER___';
  formatted = formatted.replace(/\n\n/g, PARA_MARKER);

  // Step 5: Remove ALL single line breaks (they're unwanted mid-sentence breaks)
  // This removes breaks like "Bolton NHS\nFoundation Trust" -> "Bolton NHS Foundation Trust"
  formatted = formatted.replace(/\n/g, ' ');

  // Step 6: Restore paragraph breaks
  formatted = formatted.replace(new RegExp(PARA_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '\n\n');

  // Step 7: Remove multiple spaces everywhere (clean up after line break removals)
  formatted = formatted.replace(/[ ]{2,}/g, ' ');

  // Step 8: Split by paragraph breaks and clean each paragraph
  const paragraphs = formatted.split('\n\n');
  formatted = paragraphs
    .map(para => {
      // Trim whitespace
      let cleaned = para.trim();
      // Remove any remaining line breaks (shouldn't be any, but defensive)
      cleaned = cleaned.replace(/\n/g, ' ');
      // Remove multiple spaces
      cleaned = cleaned.replace(/[ ]{2,}/g, ' ');
      return cleaned;
    })
    .filter(para => para.length > 0)
    .join('\n\n');

  // Step 9: Final cleanup - remove any remaining multiple spaces
  formatted = formatted.replace(/[ ]{2,}/g, ' ');

  // Step 10: Final trim
  const result = formatted.trim();
  
  // Debug: Log formatted text details
  const finalLineBreaks = (result.match(/\n/g) || []).length;
  const formattedPreview = result.substring(0, 300).replace(/\n/g, '\\n');
  console.log('formatAgentResponse - Formatted text:', {
    length: result.length,
    lineBreaks: finalLineBreaks,
    preview: formattedPreview,
    breaksRemoved: originalLineBreaks - finalLineBreaks,
  });
  
  return result;
};

/**
 * Makes a POST request to the query API with the provided query text
 * @param query - The query text (email text, SMS text, or WhatsApp text)
 * @param sessionId - Optional session ID for conversation tracking (SMS/WhatsApp/Email)
 * @param channel - Channel type: 'email', 'sms', or 'whatsapp'
 * @returns Promise resolving to the API response data with agent_response field
 */
export const callQueryApi = async (
  query: string,
  sessionId?: string,
  channel?: 'email' | 'sms' | 'whatsapp'
): Promise<QueryApiResponse> => {
  try {
    if (!query || !query.trim()) {
      throw new Error('Query text is required');
    }

    // Prepare the request body for the external API
    const apiRequestBody: QueryApiRequest = {
      query: query.trim(),
    };

    // Add sessionId if provided
    if (sessionId) {
      apiRequestBody.session_id = sessionId;
    }

    // Add channel if provided
    if (channel) {
      apiRequestBody.channel = channel;
    }

    console.log('Calling Query API:', {
      url: API_URL,
      query: apiRequestBody.query.substring(0, 100) + (apiRequestBody.query.length > 100 ? '...' : ''),
      session_id: apiRequestBody.session_id || 'not provided',
      channel: apiRequestBody.channel || 'not provided',
    });

    // Make POST request to the external API
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiRequestBody),
    });

    // Check if the response is ok
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Query API call failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    // Parse the response
    const responseData = await response.json() as QueryApiResponse;

    // Log the full original agent_response before formatting (for debugging)
    // if (responseData.agent_response) {
    //   const originalResponse = responseData.agent_response;
    //   const originalLineBreaks = (originalResponse.match(/\n/g) || []).length;
    //   console.log('Query API - Original agent_response:', {
    //     length: originalResponse.length,
    //     lineBreaks: originalLineBreaks,
    //     preview: originalResponse.substring(0, 500).replace(/\n/g, '\\n'),
    //     fullTextWithMarkers: originalResponse.replace(/\n/g, '\\n').substring(0, 1000),
    //   });
      
    //   // Formatting disabled - sending text without formatting
    //   // responseData.agent_response = formatAgentResponse(responseData.agent_response);
    // }

    console.log('Query API call successful:', {
      status: response.status,
      success: responseData.success,
      hasAgentResponse: !!responseData.agent_response,
      agentResponsePreview: responseData.agent_response 
        ? responseData.agent_response.substring(0, 100) + (responseData.agent_response.length > 100 ? '...' : '')
        : undefined,
    });
    
    return responseData;
  } catch (error) {
    console.error('Error calling Query API:', {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
};

/**
 * Extracts the response text from the API response to send back to the user
 * @param apiResponse - The response from callQueryApi
 * @param fallbackMessage - Optional fallback message if no response is available
 * @returns The response text to send to the user
 */
export const getResponseText = (
  apiResponse: QueryApiResponse,
  fallbackMessage: string = 'Thank you for your message. We have received it and will get back to you soon.'
): string => {
  // Priority: agent_response > message > data > fallback
  if (apiResponse.agent_response && apiResponse.agent_response.trim()) {
    return apiResponse.agent_response.trim();
  }
  if (apiResponse.message && apiResponse.message.trim()) {
    return apiResponse.message.trim();
  }
  if (apiResponse.data && typeof apiResponse.data === 'string') {
    return apiResponse.data.trim();
  }
  if (apiResponse.data && typeof apiResponse.data === 'object' && apiResponse.data.response) {
    return String(apiResponse.data.response).trim();
  }
  return fallbackMessage;
};

