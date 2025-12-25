const myHeaders = new Headers({
    'x-api-key': '_Lulx-rD8Ibrmvp_', 
    'Content-Type': 'application/json',
  });
  
  const STATIC_SIGNATURE = '2TzG5FR6KMgarAghj3yYyk5hChdf6rBMDubUNC25WQS9SFPc2auVYAE7NAxJH4UA5UeS8PR4mqjNzSnXKrUyEss4';
  
  export const getParsedTransaction = async () => {
    const requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow' as RequestRedirect,
    };
  
    try {
      const response = await fetch(
        `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${STATIC_SIGNATURE}`,
        requestOptions,
      );
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
  
      const result = await response.text();
      return result;
    } catch (error) {
      console.error('Error fetching parsed transaction:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      return null;
    }
  };
  
  // Example usage
  getParsedTransaction()
    .then(result => {
      if (result) {
          console.log('Parsed Transaction:', JSON.parse(result));
        console.log('Parsed Transaction:', result);
      }
    })
    .catch(error => {
      console.error('Error:', error);
    });