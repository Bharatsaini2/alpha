const parseTransaction = async () => {
  const url = "https://api.helius.xyz/v0/transactions/?api-key=214f77d6-79d8-4079-aa78-ad5107942ca5";

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transactions: ["5n7rmEBzom1C31XGVKQdvHkUnU9kd8DhBiTrKXRz78HjDySHoEfnNHggjek9hx2Lb1u8wtSgSN7ey87KBpcGNqGC"],
    }),
  });

  const data = await response.json();
  console.log("Parsed transaction:", data);
  console.dir(data, { depth: null, colors: true });
};

parseTransaction();