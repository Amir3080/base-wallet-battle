import {
  createPublicClient,
  http,
  isAddress,
  getAddress
} from "https://esm.sh/viem@2";

import {
  base
} from "https://esm.sh/viem@2/chains";


// =====================================================
// CONFIG
// =====================================================

const WORKER_URL =
  "https://wallet-battle-api.amirtrider1381.workers.dev";

const CACHE_TIME =
  2 * 60 * 1000;


// =====================================================
// ELEMENTS
// =====================================================

const compareButton =
  document.getElementById("compareButton");

const walletAInput =
  document.getElementById("walletA");

const walletBInput =
  document.getElementById("walletB");

const shareButton =
  document.getElementById("shareButton");

const copyLinkButton =
  document.getElementById("copyLinkButton");

const errorMessage =
  document.getElementById("errorMessage");

const winnerBox =
  document.getElementById("winnerBox");


// =====================================================
// BASE CLIENT
// =====================================================

const baseClient =
  createPublicClient({
    chain: base,

    transport: http(
      "https://mainnet.base.org"
    )
  });


// =====================================================
// CACHE
// =====================================================

const walletCache =
  new Map();


// =====================================================
// HELPERS
// =====================================================

function shortenAddress(address) {

  if (!address) {
    return "--";
  }

  return (
    address.slice(0, 6) +
    "..." +
    address.slice(-4)
  );
}


function showError(message) {

  if (!errorMessage) {
    return;
  }

  errorMessage.innerText =
    message;
}


function clearError() {

  if (!errorMessage) {
    return;
  }

  errorMessage.innerText =
    "";
}


function formatETH(value) {

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return "0 ETH";
  }


  if (value < 0.0001) {
    return "<0.0001 ETH";
  }


  if (value < 1) {

    return (
      value.toFixed(4) +
      " ETH"
    );
  }


  return (
    value.toFixed(3) +
    " ETH"
  );
}


// =====================================================
// ADDRESS VALIDATION
// =====================================================

function validateWallet(input) {

  const cleanInput =
    input.trim();


  if (!isAddress(cleanInput)) {

    throw new Error(
      "Invalid wallet address."
    );
  }


  return getAddress(
    cleanInput
  );
}


// =====================================================
// TRANSACTION HISTORY
// CLOUDFLARE -> BLOCKSCOUT
// =====================================================

async function getTransactionHistory(
  address
) {

  const url =
    `${WORKER_URL}/history?address=` +
    encodeURIComponent(address);


  const response =
    await fetch(url);


  if (!response.ok) {

    let message =
      `Wallet API error: ${response.status}`;


    try {

      const errorData =
        await response.json();


      if (errorData.error) {

        message =
          errorData.error;
      }

    } catch {
      // Ignore malformed error
    }


    throw new Error(
      message
    );
  }


  const data =
    await response.json();


  if (
    Array.isArray(
      data.result
    )
  ) {

    return data.result;
  }


  const message =
    String(
      data.message || ""
    ).toLowerCase();


  const result =
    String(
      data.result || ""
    ).toLowerCase();


  if (
    data.status === "0" &&
    (
      message.includes(
        "no transaction"
      ) ||

      result.includes(
        "no transaction"
      )
    )
  ) {

    return [];
  }


  console.error(
    "Worker response:",
    data
  );


  throw new Error(
    data.error ||
    data.message ||
    "Could not load wallet history."
  );
}


// =====================================================
// BALANCE
// =====================================================

async function getWalletBalance(
  address
) {

  try {

    const balanceWei =
      await baseClient.getBalance({
        address
      });


    return (
      Number(balanceWei) /
      1e18
    );


  } catch (error) {

    console.warn(
      "Balance request failed:",
      error
    );


    return 0;
  }
}


// =====================================================
// WALLET AGE
// =====================================================

function calculateWalletAge(
  transactions
) {

  if (
    !transactions ||
    transactions.length === 0
  ) {

    return {
      days: 0,
      text: "No activity"
    };
  }


  let oldestTimestamp =
    Infinity;


  transactions.forEach(
    tx => {

      const timestamp =
        Number(
          tx.timeStamp
        );


      if (
        timestamp > 0 &&
        timestamp <
          oldestTimestamp
      ) {

        oldestTimestamp =
          timestamp;
      }
    }
  );


  if (
    !Number.isFinite(
      oldestTimestamp
    )
  ) {

    return {
      days: 0,
      text: "Unknown"
    };
  }


  const firstDate =
    new Date(
      oldestTimestamp *
      1000
    );


  const now =
    new Date();


  const days =
    Math.max(
      0,

      Math.floor(
        (
          now -
          firstDate
        ) /
        (
          1000 *
          60 *
          60 *
          24
        )
      )
    );


  let text;


  if (days >= 365) {

    text =
      `${(days / 365)
        .toFixed(1)} years`;

  } else if (
    days >= 30
  ) {

    text =
      `${Math.floor(
        days / 30
      )} months`;

  } else {

    text =
      `${days} days`;
  }


  return {
    days,
    text
  };
}


// =====================================================
// ACTIVE DAYS
// =====================================================

function calculateActiveDays(
  transactions
) {

  const uniqueDays =
    new Set();


  transactions.forEach(
    tx => {

      const timestamp =
        Number(
          tx.timeStamp
        );


      if (!timestamp) {
        return;
      }


      const date =
        new Date(
          timestamp *
          1000
        );


      const day =
        date
          .toISOString()
          .slice(0, 10);


      uniqueDays.add(
        day
      );
    }
  );


  return uniqueDays.size;
}


// =====================================================
// ETH VOLUME
// =====================================================

function calculateVolume(
  transactions,
  walletAddress
) {

  let totalWei =
    0n;


  const wallet =
    walletAddress
      .toLowerCase();


  transactions.forEach(
    tx => {

      const from =
        String(
          tx.from || ""
        ).toLowerCase();


      const to =
        String(
          tx.to || ""
        ).toLowerCase();


      if (
        from !== wallet &&
        to !== wallet
      ) {
        return;
      }


      try {

        totalWei +=
          BigInt(
            tx.value || "0"
          );

      } catch {
        // Ignore invalid value
      }
    }
  );


  return (
    Number(totalWei) /
    1e18
  );
}


// =====================================================
// GAS SPENT
// =====================================================

function calculateGasSpent(
  transactions,
  walletAddress
) {

  let totalGasWei =
    0n;


  const wallet =
    walletAddress
      .toLowerCase();


  transactions.forEach(
    tx => {

      const from =
        String(
          tx.from || ""
        ).toLowerCase();


      // Only sender pays gas
      if (
        from !== wallet
      ) {
        return;
      }


      try {

        const gasUsed =
          BigInt(
            tx.gasUsed ||
            "0"
          );


        const gasPrice =
          BigInt(
            tx.gasPrice ||
            "0"
          );


        totalGasWei +=
          gasUsed *
          gasPrice;


      } catch {
        // Ignore malformed tx
      }
    }
  );


  return (
    Number(totalGasWei) /
    1e18
  );
}


// =====================================================
// SCORE BREAKDOWN
// =====================================================

function calculateScoreBreakdown(
  stats
) {

  // AGE = 20
  const age =
    Math.min(
      20,

      (
        stats.age.days /
        1095
      ) * 20
    );


  // TRANSACTIONS = 25
  const transactions =
    Math.min(
      25,

      (
        Math.log10(
          stats.transactions +
          1
        ) /
        4
      ) * 25
    );


  // ACTIVE DAYS = 30
  const activeDays =
    Math.min(
      30,

      (
        Math.log10(
          stats.activeDays +
          1
        ) /
        3
      ) * 30
    );


  // VOLUME = 15
  const volume =
    Math.min(
      15,

      (
        Math.log10(
          stats.volume +
          1
        ) /
        3
      ) * 15
    );


  // GAS = 10
  const gas =
    Math.min(
      10,

      (
        Math.log10(
          stats.gasSpent *
          1000 +
          1
        ) /
        3
      ) * 10
    );


  const total =
    age +
    transactions +
    activeDays +
    volume +
    gas;


  return {

    age:
      Math.round(age),

    transactions:
      Math.round(
        transactions
      ),

    activeDays:
      Math.round(
        activeDays
      ),

    volume:
      Math.round(volume),

    gas:
      Math.round(gas),

    total:
      Math.max(
        0,

        Math.min(
          100,
          Math.round(total)
        )
      )
  };
}


// =====================================================
// WALLET PERSONALITY
// =====================================================

function getWalletPersonality(
  stats
) {

  // Very active + old wallet
  if (
    stats.age.days >= 730 &&
    stats.activeDays >= 200
  ) {

    return {
      emoji: "👑",
      title: "Base OG",
      description:
        "A long-term wallet with serious onchain activity."
    };
  }


  // Huge transaction count
  if (
    stats.transactions >= 1000
  ) {

    return {
      emoji: "⚡",
      title:
        "Transaction Machine",
      description:
        "This wallet lives onchain and racks up transactions."
    };
  }


  // Lots of gas
  if (
    stats.gasSpent >= 0.05
  ) {

    return {
      emoji: "⛽",
      title: "Gas Warrior",
      description:
        "A highly active wallet that has paid serious gas."
    };
  }


  // Consistent activity
  if (
    stats.activeDays >= 100
  ) {

    return {
      emoji: "🔥",
      title:
        "Onchain Grinder",
      description:
        "Consistent activity across many different days."
    };
  }


  // High native ETH volume
  if (
    stats.volume >= 10
  ) {

    return {
      emoji: "🐋",
      title:
        "Volume Whale",
      description:
        "This wallet has moved significant native ETH volume."
    };
  }


  // New wallet
  if (
    stats.age.days <= 60
  ) {

    return {
      emoji: "🌱",
      title:
        "Fresh Wallet",
      description:
        "A new wallet beginning its journey on Base."
    };
  }


  // Low transaction count
  if (
    stats.transactions < 30
  ) {

    return {
      emoji: "🥷",
      title:
        "Silent Operator",
      description:
        "A quiet wallet with a small onchain footprint."
    };
  }


  // Default
  return {
    emoji: "🔵",
    title:
      "Base Explorer",
    description:
      "An active wallet exploring the Base ecosystem."
  };
}


// =====================================================
// GET ALL WALLET STATS
// =====================================================

async function getWalletStats(
  address
) {

  const cacheKey =
    address.toLowerCase();


  const cached =
    walletCache.get(
      cacheKey
    );


  // Browser cache: 2 minutes
  if (
    cached &&
    (
      Date.now() -
      cached.time
    ) <
    CACHE_TIME
  ) {

    return cached.data;
  }


  // Both network requests run together
  const [
    history,
    balance
  ] =
    await Promise.all([

      getTransactionHistory(
        address
      ),

      getWalletBalance(
        address
      )

    ]);


  const age =
    calculateWalletAge(
      history
    );


  const activeDays =
    calculateActiveDays(
      history
    );


  const volume =
    calculateVolume(
      history,
      address
    );


  const gasSpent =
    calculateGasSpent(
      history,
      address
    );


  const stats = {

    address,

    transactions:
      history.length,

    age,

    activeDays,

    volume,

    balance,

    gasSpent
  };


  stats.breakdown =
    calculateScoreBreakdown(
      stats
    );


  stats.onchainScore =
    stats.breakdown.total;


  stats.personality =
    getWalletPersonality(
      stats
    );


  walletCache.set(
    cacheKey,

    {
      time:
        Date.now(),

      data:
        stats
    }
  );


  return stats;
}


// =====================================================
// COMPARE VALUES
// =====================================================

function compareValues(
  valueA,
  valueB,
  elementA,
  elementB,
  formattedA,
  formattedB
) {

  elementA.innerText =
    formattedA;


  elementB.innerText =
    formattedB;


  if (valueA > valueB) {

    elementA.innerText =
      "🏆 " +
      formattedA;


    return "A";
  }


  if (valueB > valueA) {

    elementB.innerText =
      "🏆 " +
      formattedB;


    return "B";
  }


  return "tie";
}


// =====================================================
// DISPLAY PERSONALITY
// =====================================================

function displayPersonality(
  stats,
  side
) {

  const emojiElement =
    document.getElementById(
      `personalityEmoji${side}`
    );


  const titleElement =
    document.getElementById(
      `personality${side}`
    );


  const descElement =
    document.getElementById(
      `personalityDesc${side}`
    );


  if (emojiElement) {

    emojiElement.innerText =
      stats.personality.emoji;
  }


  if (titleElement) {

    titleElement.innerText =
      stats.personality.title;
  }


  if (descElement) {

    descElement.innerText =
      stats.personality.description;
  }
}


// =====================================================
// DISPLAY SCORE BREAKDOWN
// =====================================================

function displayScoreBreakdown(
  stats,
  side
) {

  const breakdown =
    stats.breakdown;


  const age =
    document.getElementById(
      `breakdownAge${side}`
    );


  const tx =
    document.getElementById(
      `breakdownTx${side}`
    );


  const days =
    document.getElementById(
      `breakdownDays${side}`
    );


  const volume =
    document.getElementById(
      `breakdownVolume${side}`
    );


  const gas =
    document.getElementById(
      `breakdownGas${side}`
    );


  if (age) {

    age.innerText =
      `+${breakdown.age} / 20`;
  }


  if (tx) {

    tx.innerText =
      `+${breakdown.transactions} / 25`;
  }


  if (days) {

    days.innerText =
      `+${breakdown.activeDays} / 30`;
  }


  if (volume) {

    volume.innerText =
      `+${breakdown.volume} / 15`;
  }


  if (gas) {

    gas.innerText =
      `+${breakdown.gas} / 10`;
  }
}


// =====================================================
// CREATE SHAREABLE URL
// =====================================================

function createBattleURL(
  walletA,
  walletB
) {

  const url =
    new URL(
      window.location.href
    );


  url.searchParams.set(
    "a",
    walletA
  );


  url.searchParams.set(
    "b",
    walletB
  );


  return url.toString();
}


// =====================================================
// COPY BATTLE LINK
// =====================================================

function prepareCopyLink(
  statsA,
  statsB
) {

  if (!copyLinkButton) {
    return;
  }


  const battleURL =
    createBattleURL(
      statsA.address,
      statsB.address
    );


  // Update current URL
  window.history.replaceState(
    {},
    "",
    battleURL
  );


  copyLinkButton.style.display =
    "block";


  copyLinkButton.onclick =
    async function () {

      try {

        await navigator
          .clipboard
          .writeText(
            battleURL
          );


        copyLinkButton.innerText =
          "✓ Link Copied";


        setTimeout(
          () => {

            copyLinkButton.innerText =
              "🔗 Copy Battle Link";

          },
          1800
        );


      } catch {

        window.prompt(
          "Copy this Battle link:",
          battleURL
        );
      }
    };
}


// =====================================================
// SHARE ON X
// =====================================================

function prepareShare(
  statsA,
  statsB,
  winnerText
) {

  if (!shareButton) {
    return;
  }


  shareButton.style.display =
    "block";


  shareButton.onclick =
    function () {

      const walletA =
        shortenAddress(
          statsA.address
        );


      const walletB =
        shortenAddress(
          statsB.address
        );


      const battleURL =
        createBattleURL(
          statsA.address,
          statsB.address
        );


      const text =
`⚔️ Base Wallet Battle

${walletA}: ${statsA.onchainScore}/100
${statsA.personality.emoji} ${statsA.personality.title}

VS

${walletB}: ${statsB.onchainScore}/100
${statsB.personality.emoji} ${statsB.personality.title}

${winnerText}

Battle your Base wallet 👇
${battleURL}

Built by @amirshonnm`;


      const shareUrl =
        "https://x.com/intent/post?text=" +
        encodeURIComponent(
          text
        );


      window.open(
        shareUrl,
        "_blank",
        "noopener,noreferrer"
      );
    };
}


// =====================================================
// RESET
// =====================================================

function resetResults() {

  const statIds = [

    "walletAgeA",
    "walletAgeB",

    "transactionsA",
    "transactionsB",

    "activeDaysA",
    "activeDaysB",

    "volumeA",
    "volumeB",

    "balanceA",
    "balanceB",

    "gasSpentA",
    "gasSpentB",

    "onchainScoreA",
    "onchainScoreB"
  ];


  statIds.forEach(
    id => {

      const element =
        document.getElementById(
          id
        );


      if (element) {

        element.innerText =
          "--";
      }
    }
  );


  // Personality reset
  [
    "A",
    "B"
  ].forEach(
    side => {

      const emoji =
        document.getElementById(
          `personalityEmoji${side}`
        );


      const title =
        document.getElementById(
          `personality${side}`
        );


      const description =
        document.getElementById(
          `personalityDesc${side}`
        );


      if (emoji) {
        emoji.innerText =
          "🧬";
      }


      if (title) {
        title.innerText =
          "--";
      }


      if (description) {

        description.innerText =
          "Analyze wallet to discover its personality.";
      }
    }
  );


  // Breakdown reset
  const breakdownIds = [

    "breakdownAgeA",
    "breakdownAgeB",

    "breakdownTxA",
    "breakdownTxB",

    "breakdownDaysA",
    "breakdownDaysB",

    "breakdownVolumeA",
    "breakdownVolumeB",

    "breakdownGasA",
    "breakdownGasB"
  ];


  breakdownIds.forEach(
    id => {

      const element =
        document.getElementById(
          id
        );


      if (element) {

        element.innerText =
          "--";
      }
    }
  );


  if (winnerBox) {

    winnerBox.innerHTML =
      `
        <div class="winner-title">
          Winner will appear here
        </div>

        <div class="winner-subtitle">
          Compare two wallets to start the battle.
        </div>
      `;
  }


  if (shareButton) {

    shareButton.style.display =
      "none";
  }


  if (copyLinkButton) {

    copyLinkButton.style.display =
      "none";

    copyLinkButton.innerText =
      "🔗 Copy Battle Link";
  }
}


// =====================================================
// COMPARE
// =====================================================

compareButton.addEventListener(
  "click",
  async function () {

    clearError();

    resetResults();


    const inputA =
      walletAInput.value.trim();


    const inputB =
      walletBInput.value.trim();


    // -------------------------
    // EMPTY INPUTS
    // -------------------------

    if (!inputA) {

      showError(
        "Enter Wallet A address."
      );

      return;
    }


    if (!inputB) {

      showError(
        "Enter Wallet B address."
      );

      return;
    }


    // -------------------------
    // VALIDATE
    // -------------------------

    let walletA;
    let walletB;


    try {

      walletA =
        validateWallet(
          inputA
        );

    } catch {

      showError(
        "Wallet A address is invalid."
      );

      return;
    }


    try {

      walletB =
        validateWallet(
          inputB
        );

    } catch {

      showError(
        "Wallet B address is invalid."
      );

      return;
    }


    // -------------------------
    // LOADING
    // -------------------------

    compareButton.innerText =
      "⚡ Analyzing Base...";


    compareButton.disabled =
      true;


    try {

      // BOTH wallets at same time
      const [
        statsA,
        statsB
      ] =
        await Promise.all([

          getWalletStats(
            walletA
          ),

          getWalletStats(
            walletB
          )

        ]);


      // -------------------------
      // PERSONALITIES
      // -------------------------

      displayPersonality(
        statsA,
        "A"
      );


      displayPersonality(
        statsB,
        "B"
      );


      // -------------------------
      // SCORE BREAKDOWN
      // -------------------------

      displayScoreBreakdown(
        statsA,
        "A"
      );


      displayScoreBreakdown(
        statsB,
        "B"
      );


      // -------------------------
      // ELEMENTS
      // -------------------------

      const ageA =
        document.getElementById(
          "walletAgeA"
        );


      const ageB =
        document.getElementById(
          "walletAgeB"
        );


      const txA =
        document.getElementById(
          "transactionsA"
        );


      const txB =
        document.getElementById(
          "transactionsB"
        );


      const activeA =
        document.getElementById(
          "activeDaysA"
        );


      const activeB =
        document.getElementById(
          "activeDaysB"
        );


      const volumeA =
        document.getElementById(
          "volumeA"
        );


      const volumeB =
        document.getElementById(
          "volumeB"
        );


      const balanceA =
        document.getElementById(
          "balanceA"
        );


      const balanceB =
        document.getElementById(
          "balanceB"
        );


      const gasA =
        document.getElementById(
          "gasSpentA"
        );


      const gasB =
        document.getElementById(
          "gasSpentB"
        );


      const scoreA =
        document.getElementById(
          "onchainScoreA"
        );


      const scoreB =
        document.getElementById(
          "onchainScoreB"
        );


      // -------------------------
      // BATTLE SCORE
      // -------------------------

      let battleScoreA =
        0;


      let battleScoreB =
        0;


      // AGE
      const ageWinner =
        compareValues(

          statsA.age.days,
          statsB.age.days,

          ageA,
          ageB,

          statsA.age.text,
          statsB.age.text
        );


      if (
        ageWinner === "A"
      ) {
        battleScoreA++;
      }


      if (
        ageWinner === "B"
      ) {
        battleScoreB++;
      }


      // TRANSACTIONS
      const txWinner =
        compareValues(

          statsA.transactions,
          statsB.transactions,

          txA,
          txB,

          statsA.transactions
            .toLocaleString(),

          statsB.transactions
            .toLocaleString()
        );


      if (
        txWinner === "A"
      ) {
        battleScoreA++;
      }


      if (
        txWinner === "B"
      ) {
        battleScoreB++;
      }


      // ACTIVE DAYS
      const activeWinner =
        compareValues(

          statsA.activeDays,
          statsB.activeDays,

          activeA,
          activeB,

          statsA.activeDays
            .toLocaleString(),

          statsB.activeDays
            .toLocaleString()
        );


      if (
        activeWinner === "A"
      ) {
        battleScoreA++;
      }


      if (
        activeWinner === "B"
      ) {
        battleScoreB++;
      }


      // VOLUME
      const volumeWinner =
        compareValues(

          statsA.volume,
          statsB.volume,

          volumeA,
          volumeB,

          formatETH(
            statsA.volume
          ),

          formatETH(
            statsB.volume
          )
        );


      if (
        volumeWinner === "A"
      ) {
        battleScoreA++;
      }


      if (
        volumeWinner === "B"
      ) {
        battleScoreB++;
      }


      // BALANCE
      const balanceWinner =
        compareValues(

          statsA.balance,
          statsB.balance,

          balanceA,
          balanceB,

          formatETH(
            statsA.balance
          ),

          formatETH(
            statsB.balance
          )
        );


      if (
        balanceWinner === "A"
      ) {
        battleScoreA++;
      }


      if (
        balanceWinner === "B"
      ) {
        battleScoreB++;
      }


      // GAS
      const gasWinner =
        compareValues(

          statsA.gasSpent,
          statsB.gasSpent,

          gasA,
          gasB,

          formatETH(
            statsA.gasSpent
          ),

          formatETH(
            statsB.gasSpent
          )
        );


      if (
        gasWinner === "A"
      ) {
        battleScoreA++;
      }


      if (
        gasWinner === "B"
      ) {
        battleScoreB++;
      }


      // ONCHAIN SCORE
      compareValues(

        statsA.onchainScore,
        statsB.onchainScore,

        scoreA,
        scoreB,

        `${statsA.onchainScore} / 100`,

        `${statsB.onchainScore} / 100`
      );


      // -------------------------
      // WINNER
      // -------------------------

      let winnerText;


      if (
        battleScoreA >
        battleScoreB
      ) {

        winnerBox.innerHTML =
          `
            <div class="winner-title">
              🏆 Wallet A Wins — ${battleScoreA} : ${battleScoreB}
            </div>

            <div class="winner-subtitle">
              Stronger onchain activity on Base 🎉
            </div>
          `;


        winnerText =
          `🏆 Wallet A wins ${battleScoreA}:${battleScoreB}!`;


      } else if (
        battleScoreB >
        battleScoreA
      ) {

        winnerBox.innerHTML =
          `
            <div class="winner-title">
              🏆 Wallet B Wins — ${battleScoreB} : ${battleScoreA}
            </div>

            <div class="winner-subtitle">
              Stronger onchain activity on Base 🎉
            </div>
          `;


        winnerText =
          `🏆 Wallet B wins ${battleScoreB}:${battleScoreA}!`;


      } else {

        winnerBox.innerHTML =
          `
            <div class="winner-title">
              🤝 Draw — ${battleScoreA} : ${battleScoreB}
            </div>

            <div class="winner-subtitle">
              These wallets are evenly matched.
            </div>
          `;


        winnerText =
          `🤝 Draw ${battleScoreA}:${battleScoreB}!`;
      }


      // -------------------------
      // SHARE
      // -------------------------

      prepareShare(
        statsA,
        statsB,
        winnerText
      );


      // -------------------------
      // COPY LINK
      // -------------------------

      prepareCopyLink(
        statsA,
        statsB
      );


      console.log(
        "Wallet A:",
        statsA
      );


      console.log(
        "Wallet B:",
        statsB
      );


    } catch (error) {

      console.error(
        "Wallet Battle Error:",
        error
      );


      showError(
        error.message ||
        "Could not analyze wallets. Please try again."
      );


    } finally {

      compareButton.innerText =
        "⚔ Compare Wallets";


      compareButton.disabled =
        false;
    }
  }
);


// =====================================================
// PRESS ENTER
// =====================================================

[
  walletAInput,
  walletBInput
].forEach(
  input => {

    input.addEventListener(
      "keydown",
      event => {

        if (
          event.key ===
          "Enter"
        ) {

          compareButton.click();
        }
      }
    );
  }
);


// =====================================================
// LOAD WALLETS FROM SHARED URL
// =====================================================

function loadBattleFromURL() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const walletA =
    params.get("a");


  const walletB =
    params.get("b");


  if (
    walletA &&
    walletB &&
    isAddress(walletA) &&
    isAddress(walletB)
  ) {

    walletAInput.value =
      walletA;


    walletBInput.value =
      walletB;
  }
}


loadBattleFromURL();