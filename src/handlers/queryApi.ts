import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

interface QueryApiRequest {
  query: string;
  employee_id: string;
}

interface QueryApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

const API_URL = 'https://uzq2msccdm2sczqgr2kseiwuma0jdgav.lambda-url.us-west-2.on.aws/';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'Request body is missing',
        } as QueryApiResponse),
      };
    }

    const requestBody: QueryApiRequest = JSON.parse(event.body);
    const { query, employee_id } = requestBody;

    // Validate required fields
    if (!query || !employee_id) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: query and employee_id are required',
        } as QueryApiResponse),
      };
    }

    // Prepare the request body for the external API
    const apiRequestBody = {
      query: query,
      employee_id: employee_id,
    };

    console.log('Making API call to:', API_URL);
    console.log('Request body:', JSON.stringify(apiRequestBody));

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
      console.error('API call failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: `API call failed: ${response.statusText}`,
          details: errorText,
        } as QueryApiResponse),
      };
    }

    // Parse the response
    const responseData = await response.json();

    console.log('API call successful:', {
      status: response.status,
      data: responseData,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: responseData,
      } as QueryApiResponse),
    };
  } catch (error) {
    console.error('Error calling external API:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } as QueryApiResponse),
    };
  }
};

