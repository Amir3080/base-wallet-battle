const compareButton = document.getElementById("compareButton");
const walletAInput = document.getElementById("walletA");
const walletBInput = document.getElementById("walletB");


// -------------------------
// Wallet validation
// -------------------------

function isValidWallet(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}


// -------------------------
// Get transaction count
// -------------------------

async function getTransactionCount(address) {
  const counterUrl =
    `https://base.blockscout.com/api/v2/addresses/${address}/counters`;

  try {
    const response = await fetch(counterUrl);

    if (response.ok) {
      const data = await response.json();

      if (data.transactions_count !== undefined) {
        return Number(data.transactions_count) || 0;
      }
    }
  } catch (error) {
    console.log("Counter API failed, using fallback.");
  }

  // Fallback
  const fallbackUrl =
    `https://base.blockscout.com/api` +
    `?module=account` +
    `&action=txlist` +
    `&address=${address}` +
    `&page=1` +
    `&offset=10000` +
    `&sort=asc`;

  const response = await fetch(fallbackUrl);

  if (!response.ok) {
    throw new Error("Could not get transaction count");
  }

  const data = await response.json();

  if (!Array.isArray(data.result)) {
    return 0;
  }

  return data.result.length;
}


// -------------------------
// Get transaction history
// Used for age, active days,
// and native ETH volume
// -------------------------

async function getTransactionHistory(address) {
  const url =
    `https://base.blockscout.com/api` +
    `?module=account` +
    `&action=txlist` +
    `&address=${address}` +
    `&page=1` +
    `&offset=10000` +
    `&sort=asc`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Could not get wallet history");
  }

  const data = await response.json();

  if (!Array.isArray(data.result)) {
    return [];
  }

  return data.result;
}


// -------------------------
// Calculate wallet age
// -------------------------

function calculateWalletAge(transactions) {
  if (transactions.length === 0) {
    return {
      days: 0,
      text: "No activity"
    };
  }

  const firstTx = transactions[0];

  const firstDate =
    new Date(Number(firstTx.timeStamp) * 1000);

  const now = new Date();

  const days = Math.floor(
    (now - firstDate) /
    (1000 * 60 * 60 * 24)
  );

  let text;

  if (days >= 365) {
    text = `${(days / 365).toFixed(1)} years`;
  } else if (days >= 30) {
    text = `${Math.floor(days / 30)} months`;
  } else {
    text = `${days} days`;
  }

  return {
    days,
    text
  };
}


// -------------------------
// Calculate active days
// -------------------------

function calculateActiveDays(transactions) {
  const uniqueDays = new Set();

  transactions.forEach(tx => {
    const date =
      new Date(Number(tx.timeStamp) * 1000);

    const day =
      `${date.getUTCFullYear()}-` +
      `${date.getUTCMonth() + 1}-` +
      `${date.getUTCDate()}`;

    uniqueDays.add(day);
  });

  return uniqueDays.size;
}


// -------------------------
// Calculate native ETH volume
// -------------------------

function calculateVolume(transactions, walletAddress) {
  let totalWei = 0n;

  const wallet =
    walletAddress.toLowerCase();

  transactions.forEach(tx => {
    const from =
      (tx.from || "").toLowerCase();

    const to =
      (tx.to || "").toLowerCase();

    if (from === wallet || to === wallet) {
      try {
        totalWei += BigInt(tx.value || "0");
      } catch {
        // Ignore invalid value
      }
    }
  });

  const eth =
    Number(totalWei) / 1e18;

  return eth;
}


// -------------------------
// Get all wallet stats
// -------------------------

async function getWalletStats(address) {

  // Run requests together for speed
  const [transactionCount, history] =
    await Promise.all([
      getTransactionCount(address),
      getTransactionHistory(address)
    ]);

  const age =
    calculateWalletAge(history);

  const activeDays =
    calculateActiveDays(history);

  const volume =
    calculateVolume(history, address);

  return {
    transactions: transactionCount,
    age,
    activeDays,
    volume
  };
}


// -------------------------
// Add trophy
// -------------------------

function compareValues(
  valueA,
  valueB,
  elementA,
  elementB,
  formattedA,
  formattedB
) {

  elementA.innerText = formattedA;
  elementB.innerText = formattedB;

  if (valueA > valueB) {
    elementA.innerText =
      "🏆 " + formattedA;

    return "A";
  }

  if (valueB > valueA) {
    elementB.innerText =
      "🏆 " + formattedB;

    return "B";
  }

  return "tie";
}


// -------------------------
// Compare button
// -------------------------

compareButton.addEventListener(
  "click",
  async function () {

    const walletA =
      walletAInput.value.trim();

    const walletB =
      walletBInput.value.trim();


    if (!isValidWallet(walletA)) {
      alert("Wallet A address is invalid.");
      return;
    }

    if (!isValidWallet(walletB)) {
      alert("Wallet B address is invalid.");
      return;
    }


    compareButton.innerText =
      "Analyzing...";

    compareButton.disabled = true;


    try {

      // Both wallets analyzed simultaneously
      const [statsA, statsB] =
        await Promise.all([
          getWalletStats(walletA),
          getWalletStats(walletB)
        ]);


      // -------------------------
      // HTML elements
      // -------------------------

      const transactionsAElement =
        document.getElementById(
          "transactionsA"
        );

      const transactionsBElement =
        document.getElementById(
          "transactionsB"
        );

      const walletAgeAElement =
        document.getElementById(
          "walletAgeA"
        );

      const walletAgeBElement =
        document.getElementById(
          "walletAgeB"
        );

      const activeDaysAElement =
        document.getElementById(
          "activeDaysA"
        );

      const activeDaysBElement =
        document.getElementById(
          "activeDaysB"
        );

      const volumeAElement =
        document.getElementById(
          "volumeA"
        );

      const volumeBElement =
        document.getElementById(
          "volumeB"
        );

      const winnerBox =
        document.querySelector(
          ".winner-box"
        );


      // -------------------------
      // Score
      // -------------------------

      let scoreA = 0;
      let scoreB = 0;


      // Transactions
      const txWinner =
        compareValues(
          statsA.transactions,
          statsB.transactions,
          transactionsAElement,
          transactionsBElement,
          statsA.transactions.toLocaleString(),
          statsB.transactions.toLocaleString()
        );

      if (txWinner === "A") scoreA++;
      if (txWinner === "B") scoreB++;


      // Wallet Age
      const ageWinner =
        compareValues(
          statsA.age.days,
          statsB.age.days,
          walletAgeAElement,
          walletAgeBElement,
          statsA.age.text,
          statsB.age.text
        );

      if (ageWinner === "A") scoreA++;
      if (ageWinner === "B") scoreB++;


      // Active Days
      const daysWinner =
        compareValues(
          statsA.activeDays,
          statsB.activeDays,
          activeDaysAElement,
          activeDaysBElement,
          statsA.activeDays.toLocaleString(),
          statsB.activeDays.toLocaleString()
        );

      if (daysWinner === "A") scoreA++;
      if (daysWinner === "B") scoreB++;


      // Volume
      const volumeWinner =
        compareValues(
          statsA.volume,
          statsB.volume,
          volumeAElement,
          volumeBElement,
          `${statsA.volume.toFixed(3)} ETH`,
          `${statsB.volume.toFixed(3)} ETH`
        );

      if (volumeWinner === "A") scoreA++;
      if (volumeWinner === "B") scoreB++;


      // -------------------------
      // Final Winner
      // -------------------------

      if (scoreA > scoreB) {

        winnerBox.innerText =
          `🏆 Wallet A Wins — ${scoreA} : ${scoreB}`;

      } else if (scoreB > scoreA) {

        winnerBox.innerText =
          `🏆 Wallet B Wins — ${scoreB} : ${scoreA}`;

      } else {

        winnerBox.innerText =
          `🤝 Draw — ${scoreA} : ${scoreB}`;

      }


      console.log("Wallet A:", statsA);
      console.log("Wallet B:", statsB);

    } catch (error) {

      console.error(error);

      alert(
        "Could not analyze wallets. Please try again."
      );

    } finally {

      compareButton.innerText =
        "⚔ Compare Wallets";

      compareButton.disabled = false;

    }

  }
);