import {
  createPublicClient,
  http,
  isAddress,
  getAddress
} from "https://esm.sh/viem@2";

import {
  base
} from "https://esm.sh/viem@2/chains";


const WORKER_URL =
  "https://wallet-battle-api.amirtrider1381.workers.dev";

const CACHE_TIME =
  2 * 60 * 1000;

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;


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

const downloadCardButton =
  document.getElementById("downloadCardButton");

const errorMessage =
  document.getElementById("errorMessage");

const winnerBox =
  document.getElementById("winnerBox");

const battleCardSection =
  document.getElementById("battleCardSection");

const battleCanvas =
  document.getElementById("battleCanvas");


const baseClient =
  createPublicClient({
    chain: base,
    transport: http(
      "https://mainnet.base.org"
    )
  });


const walletCache =
  new Map();


function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}


function shortenAddress(address) {
  return (
    address.slice(0, 6) +
    "..." +
    address.slice(-4)
  );
}


function showError(message) {
  errorMessage.textContent =
    message;
}


function clearError() {
  errorMessage.textContent =
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


async function fetchWithRetry(
  url,
  retries = MAX_RETRIES
) {

  let lastError;

  for (
    let attempt = 1;
    attempt <= retries;
    attempt++
  ) {

    try {

      const response =
        await fetch(url);

      if (response.ok) {
        return response;
      }

      let serverMessage =
        `Server error: ${response.status}`;

      try {

        const data =
          await response.json();

        if (data.error) {
          serverMessage =
            data.error;
        } else if (data.message) {
          serverMessage =
            data.message;
        }

      } catch {}

      throw new Error(
        serverMessage
      );

    } catch (error) {

      lastError =
        error;

      if (attempt < retries) {

        await sleep(
          RETRY_DELAY * attempt
        );
      }
    }
  }

  throw lastError ||
    new Error(
      "Request failed."
    );
}


async function getTransactionHistory(address) {

  const url =
    `${WORKER_URL}/history?address=` +
    encodeURIComponent(address);

  const response =
    await fetchWithRetry(url);

  const data =
    await response.json();

  // Normal transaction result
  if (Array.isArray(data.result)) {
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


  // Valid wallet but no Base transactions
  if (
    data.status === "0" &&
    (
      message.includes("no transaction") ||
      message.includes("no transactions") ||
      message.includes("no records") ||
      message.includes("not found") ||
      result.includes("no transaction") ||
      result.includes("no transactions") ||
      result.includes("no records") ||
      result.includes("not found")
    )
  ) {
    return [];
  }


  // Some APIs return null/empty result for unused wallets
  if (
    data.result === null ||
    data.result === "" ||
    typeof data.result === "undefined"
  ) {
    return [];
  }


  throw new Error(
    data.error ||
    data.message ||
    "Could not load wallet history."
  );
}

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

  } catch {

    return 0;
  }
}


function calculateWalletAge(
  transactions
) {

  if (!transactions.length) {

    return {
      days: 0,
      text: "No activity"
    };
  }

  let oldest =
    Infinity;

  transactions.forEach(tx => {

    const timestamp =
      Number(tx.timeStamp);

    if (
      timestamp > 0 &&
      timestamp < oldest
    ) {
      oldest =
        timestamp;
    }
  });

  if (!Number.isFinite(oldest)) {

    return {
      days: 0,
      text: "Unknown"
    };
  }

  const days =
    Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          oldest * 1000
        ) /
        86400000
      )
    );

  let text;

  if (days >= 365) {

    text =
      `${(days / 365).toFixed(1)} years`;

  } else if (days >= 30) {

    text =
      `${Math.floor(days / 30)} months`;

  } else {

    text =
      `${days} days`;
  }

  return {
    days,
    text
  };
}


function calculateActiveDays(
  transactions
) {

  const days =
    new Set();

  transactions.forEach(tx => {

    const timestamp =
      Number(tx.timeStamp);

    if (!timestamp) {
      return;
    }

    const date =
      new Date(
        timestamp * 1000
      )
      .toISOString()
      .slice(0, 10);

    days.add(date);
  });

  return days.size;
}


function calculateVolume(
  transactions,
  walletAddress
) {

  let totalWei =
    0n;

  const wallet =
    walletAddress.toLowerCase();

  transactions.forEach(tx => {

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

    } catch {}
  });

  return (
    Number(totalWei) /
    1e18
  );
}


function calculateGasSpent(
  transactions,
  walletAddress
) {

  let totalGasWei =
    0n;

  const wallet =
    walletAddress.toLowerCase();

  transactions.forEach(tx => {

    const from =
      String(
        tx.from || ""
      ).toLowerCase();

    if (from !== wallet) {
      return;
    }

    try {

      const gasUsed =
        BigInt(
          tx.gasUsed || "0"
        );

      const gasPrice =
        BigInt(
          tx.gasPrice || "0"
        );

      totalGasWei +=
        gasUsed *
        gasPrice;

    } catch {}
  });

  return (
    Number(totalGasWei) /
    1e18
  );
}


function calculateScoreBreakdown(
  stats
) {

  const age =
    Math.min(
      20,
      (
        stats.age.days /
        1095
      ) * 20
    );

  const transactions =
    Math.min(
      25,
      (
        Math.log10(
          stats.transactions + 1
        ) /
        4
      ) * 25
    );

  const activeDays =
    Math.min(
      30,
      (
        Math.log10(
          stats.activeDays + 1
        ) /
        3
      ) * 30
    );

  const volume =
    Math.min(
      15,
      (
        Math.log10(
          stats.volume + 1
        ) /
        3
      ) * 15
    );

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
    Math.round(
      age +
      transactions +
      activeDays +
      volume +
      gas
    );

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
          total
        )
      )
  };
}


function getWalletPersonality(
  stats
) {

  if (
    stats.transactions === 0
  ) {

    return {
      emoji: "💤",
      title: "Dormant Wallet",
      description:
        "No visible transaction activity found on Base."
    };
  }

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

  if (
    stats.transactions >= 1000
  ) {

    return {
      emoji: "⚡",
      title: "Transaction Machine",
      description:
        "This wallet lives onchain and racks up transactions."
    };
  }

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

  if (
    stats.activeDays >= 100
  ) {

    return {
      emoji: "🔥",
      title: "Onchain Grinder",
      description:
        "Consistent activity across many different days."
    };
  }

  if (
    stats.volume >= 10
  ) {

    return {
      emoji: "🐋",
      title: "Volume Whale",
      description:
        "This wallet has moved significant native ETH volume."
    };
  }

  if (
    stats.age.days <= 60
  ) {

    return {
      emoji: "🌱",
      title: "Fresh Wallet",
      description:
        "A new wallet beginning its journey on Base."
    };
  }

  if (
    stats.transactions < 30
  ) {

    return {
      emoji: "🥷",
      title: "Silent Operator",
      description:
        "A quiet wallet with a small onchain footprint."
    };
  }

  return {
    emoji: "🔵",
    title: "Base Explorer",
    description:
      "An active wallet exploring the Base ecosystem."
  };
}


async function getWalletStats(
  address
) {

  const key =
    address.toLowerCase();

  const cached =
    walletCache.get(key);

  if (
    cached &&
    Date.now() -
    cached.time <
    CACHE_TIME
  ) {

    return cached.data;
  }

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

  const stats = {

    address,

    transactions:
      history.length,

    age:
      calculateWalletAge(
        history
      ),

    activeDays:
      calculateActiveDays(
        history
      ),

    volume:
      calculateVolume(
        history,
        address
      ),

    balance,

    gasSpent:
      calculateGasSpent(
        history,
        address
      )
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
    key,
    {
      time:
        Date.now(),

      data:
        stats
    }
  );

  return stats;
}


function compareValues(
  valueA,
  valueB,
  elementA,
  elementB,
  formattedA,
  formattedB
) {

  elementA.classList.remove(
    "metric-winner"
  );

  elementB.classList.remove(
    "metric-winner"
  );

  elementA.textContent =
    formattedA;

  elementB.textContent =
    formattedB;

  if (valueA > valueB) {

    elementA.textContent =
      "🏆 " +
      formattedA;

    elementA.classList.add(
      "metric-winner"
    );

    return "A";
  }

  if (valueB > valueA) {

    elementB.textContent =
      "🏆 " +
      formattedB;

    elementB.classList.add(
      "metric-winner"
    );

    return "B";
  }

  return "tie";
}


function displayPersonality(
  stats,
  side
) {

  document.getElementById(
    `personalityEmoji${side}`
  ).textContent =
    stats.personality.emoji;

  document.getElementById(
    `personality${side}`
  ).textContent =
    stats.personality.title;

  document.getElementById(
    `personalityDesc${side}`
  ).textContent =
    stats.personality.description;
}


function displayScoreBreakdown(
  stats,
  side
) {

  const score =
    stats.breakdown;

  document.getElementById(
    `breakdownAge${side}`
  ).textContent =
    `+${score.age} / 20`;

  document.getElementById(
    `breakdownTx${side}`
  ).textContent =
    `+${score.transactions} / 25`;

  document.getElementById(
    `breakdownDays${side}`
  ).textContent =
    `+${score.activeDays} / 30`;

  document.getElementById(
    `breakdownVolume${side}`
  ).textContent =
    `+${score.volume} / 15`;

  document.getElementById(
    `breakdownGas${side}`
  ).textContent =
    `+${score.gas} / 10`;
}


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


function updateBattleCard(
  statsA,
  statsB,
  winnerText
) {

  battleCardSection.style.display =
    "block";

  document.getElementById(
    "cardAddressA"
  ).textContent =
    shortenAddress(
      statsA.address
    );

  document.getElementById(
    "cardAddressB"
  ).textContent =
    shortenAddress(
      statsB.address
    );

  document.getElementById(
    "cardScoreA"
  ).textContent =
    statsA.onchainScore;

  document.getElementById(
    "cardScoreB"
  ).textContent =
    statsB.onchainScore;

  document.getElementById(
    "cardPersonalityA"
  ).textContent =
    `${statsA.personality.emoji} ${statsA.personality.title}`;

  document.getElementById(
    "cardPersonalityB"
  ).textContent =
    `${statsB.personality.emoji} ${statsB.personality.title}`;

  document.getElementById(
    "cardWinner"
  ).textContent =
    winnerText;
}


function roundedRect(
  ctx,
  x,
  y,
  width,
  height,
  radius,
  fillStyle
) {

  ctx.fillStyle =
    fillStyle;

  ctx.beginPath();

  ctx.roundRect(
    x,
    y,
    width,
    height,
    radius
  );

  ctx.fill();
}


function drawBattleCard(
  statsA,
  statsB,
  winnerText
) {

  const canvas =
    battleCanvas;

  const ctx =
    canvas.getContext("2d");

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );


  const bg =
    ctx.createLinearGradient(
      0,
      0,
      1200,
      675
    );

  bg.addColorStop(
    0,
    "#06122f"
  );

  bg.addColorStop(
    0.55,
    "#0a2058"
  );

  bg.addColorStop(
    1,
    "#0052ff"
  );

  ctx.fillStyle =
    bg;

  ctx.fillRect(
    0,
    0,
    1200,
    675
  );


  const glow =
    ctx.createRadialGradient(
      130,
      100,
      10,
      130,
      100,
      380
    );

  glow.addColorStop(
    0,
    "rgba(57,112,255,.9)"
  );

  glow.addColorStop(
    1,
    "rgba(57,112,255,0)"
  );

  ctx.fillStyle =
    glow;

  ctx.fillRect(
    0,
    0,
    1200,
    675
  );


  ctx.fillStyle =
    "#0052ff";

  ctx.beginPath();

  ctx.arc(
    70,
    65,
    28,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.fillStyle =
    "#ffffff";

  ctx.fillRect(
    51,
    62,
    38,
    6
  );


  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "900 28px Arial";

  ctx.textAlign =
    "left";

  ctx.fillText(
    "BASE WALLET BATTLE",
    120,
    72
  );


  ctx.fillStyle =
    "#a9bce5";

  ctx.font =
    "600 16px Arial";

  ctx.fillText(
    "Which Base wallet wins?",
    120,
    103
  );


  roundedRect(
    ctx,
    70,
    165,
    430,
    310,
    28,
    "rgba(255,255,255,.08)"
  );

  roundedRect(
    ctx,
    700,
    165,
    430,
    310,
    28,
    "rgba(255,255,255,.08)"
  );


  ctx.textAlign =
    "center";


  ctx.fillStyle =
    "#9eb4df";

  ctx.font =
    "800 15px Arial";

  ctx.fillText(
    "WALLET A",
    285,
    213
  );


  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "800 26px Arial";

  ctx.fillText(
    shortenAddress(
      statsA.address
    ),
    285,
    258
  );


  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "900 104px Arial";

  ctx.fillText(
    statsA.onchainScore,
    285,
    375
  );


  ctx.fillStyle =
    "#9eb4df";

  ctx.font =
    "700 18px Arial";

  ctx.fillText(
    "/ 100",
    285,
    408
  );


  ctx.fillStyle =
    "#c7d5f3";

  ctx.font =
    "800 22px Arial";

  ctx.fillText(
    statsA.personality.title,
    285,
    450
  );


  ctx.fillStyle =
    "#9eb4df";

  ctx.font =
    "800 15px Arial";

  ctx.fillText(
    "WALLET B",
    915,
    213
  );


  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "800 26px Arial";

  ctx.fillText(
    shortenAddress(
      statsB.address
    ),
    915,
    258
  );


  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "900 104px Arial";

  ctx.fillText(
    statsB.onchainScore,
    915,
    375
  );


  ctx.fillStyle =
    "#9eb4df";

  ctx.font =
    "700 18px Arial";

  ctx.fillText(
    "/ 100",
    915,
    408
  );


  ctx.fillStyle =
    "#c7d5f3";

  ctx.font =
    "800 22px Arial";

  ctx.fillText(
    statsB.personality.title,
    915,
    450
  );


  ctx.fillStyle =
    "#0052ff";

  ctx.beginPath();

  ctx.arc(
    600,
    320,
    54,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "900 28px Arial";

  ctx.fillText(
    "VS",
    600,
    330
  );


  roundedRect(
    ctx,
    250,
    515,
    700,
    72,
    20,
    "rgba(255,255,255,.10)"
  );


  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "900 28px Arial";

  ctx.fillText(
    winnerText,
    600,
    560
  );


  ctx.fillStyle =
    "#a7b8dc";

  ctx.font =
    "600 16px Arial";


  ctx.textAlign =
    "left";

  ctx.fillText(
    "Built on Base",
    70,
    635
  );


  ctx.textAlign =
    "right";

  ctx.fillText(
    "@amirshonnm",
    1130,
    635
  );
}


function prepareBattleCardDownload(
  statsA,
  statsB,
  winnerText
) {

  downloadCardButton.style.display =
    "block";

  downloadCardButton.onclick =
    function () {

      drawBattleCard(
        statsA,
        statsB,
        winnerText
      );

      const link =
        document.createElement(
          "a"
        );

      link.download =
        "base-wallet-battle.png";

      link.href =
        battleCanvas.toDataURL(
          "image/png"
        );

      link.click();
    };
}


function prepareCopyLink(
  statsA,
  statsB
) {

  const battleURL =
    createBattleURL(
      statsA.address,
      statsB.address
    );

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

        copyLinkButton.textContent =
          "✓ Link Copied";

        setTimeout(
          () => {

            copyLinkButton.textContent =
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


function prepareShare(
  statsA,
  statsB,
  winnerText
) {

  shareButton.style.display =
    "block";

  shareButton.onclick =
    function () {

      const battleURL =
        createBattleURL(
          statsA.address,
          statsB.address
        );

      const text =
`⚔️ Base Wallet Battle

${shortenAddress(statsA.address)}
Score: ${statsA.onchainScore}/100
${statsA.personality.emoji} ${statsA.personality.title}

VS

${shortenAddress(statsB.address)}
Score: ${statsB.onchainScore}/100
${statsB.personality.emoji} ${statsB.personality.title}

${winnerText}

Battle your Base wallet 👇
${battleURL}

Built by @amirshonnm`;

      const shareURL =
        "https://x.com/intent/post?text=" +
        encodeURIComponent(
          text
        );

      window.open(
        shareURL,
        "_blank",
        "noopener,noreferrer"
      );
    };
}


function resetResults() {

  document
    .querySelectorAll(
      ".stat-value"
    )
    .forEach(element => {

      element.textContent =
        "--";

      element.classList.remove(
        "metric-winner"
      );
    });


  [
    "A",
    "B"
  ].forEach(side => {

    document.getElementById(
      `personalityEmoji${side}`
    ).textContent =
      "🧬";

    document.getElementById(
      `personality${side}`
    ).textContent =
      "--";

    document.getElementById(
      `personalityDesc${side}`
    ).textContent =
      "Analyze wallet to discover its personality.";
  });


  [
    "Age",
    "Tx",
    "Days",
    "Volume",
    "Gas"
  ].forEach(type => {

    [
      "A",
      "B"
    ].forEach(side => {

      document.getElementById(
        `breakdown${type}${side}`
      ).textContent =
        "--";
    });
  });


  winnerBox.innerHTML =
    `
      <div class="winner-title">
        Winner will appear here
      </div>

      <div class="winner-subtitle">
        Compare two wallets to start the battle.
      </div>
    `;


  battleCardSection.style.display =
    "none";

  shareButton.style.display =
    "none";

  copyLinkButton.style.display =
    "none";

  downloadCardButton.style.display =
    "none";
}


compareButton.addEventListener(
  "click",
  async function () {

    clearError();

    resetResults();


    let walletA;
    let walletB;


    try {

      walletA =
        validateWallet(
          walletAInput.value
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
          walletBInput.value
        );

    } catch {

      showError(
        "Wallet B address is invalid."
      );

      return;
    }


    compareButton.disabled =
      true;

    compareButton.textContent =
      "⚡ Analyzing Base...";


    try {

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


      displayPersonality(
        statsA,
        "A"
      );

      displayPersonality(
        statsB,
        "B"
      );

      displayScoreBreakdown(
        statsA,
        "A"
      );

      displayScoreBreakdown(
        statsB,
        "B"
      );


      let battleScoreA =
        0;

      let battleScoreB =
        0;


      function battleMetric(
        valueA,
        valueB,
        idA,
        idB,
        formattedA,
        formattedB
      ) {

        const winner =
          compareValues(
            valueA,
            valueB,
            document.getElementById(
              idA
            ),
            document.getElementById(
              idB
            ),
            formattedA,
            formattedB
          );

        if (winner === "A") {
          battleScoreA++;
        }

        if (winner === "B") {
          battleScoreB++;
        }
      }


      battleMetric(
        statsA.age.days,
        statsB.age.days,
        "walletAgeA",
        "walletAgeB",
        statsA.age.text,
        statsB.age.text
      );


      battleMetric(
        statsA.transactions,
        statsB.transactions,
        "transactionsA",
        "transactionsB",
        statsA.transactions
          .toLocaleString(),
        statsB.transactions
          .toLocaleString()
      );


      battleMetric(
        statsA.activeDays,
        statsB.activeDays,
        "activeDaysA",
        "activeDaysB",
        statsA.activeDays
          .toLocaleString(),
        statsB.activeDays
          .toLocaleString()
      );


      battleMetric(
        statsA.volume,
        statsB.volume,
        "volumeA",
        "volumeB",
        formatETH(
          statsA.volume
        ),
        formatETH(
          statsB.volume
        )
      );


      battleMetric(
        statsA.balance,
        statsB.balance,
        "balanceA",
        "balanceB",
        formatETH(
          statsA.balance
        ),
        formatETH(
          statsB.balance
        )
      );


      battleMetric(
        statsA.gasSpent,
        statsB.gasSpent,
        "gasSpentA",
        "gasSpentB",
        formatETH(
          statsA.gasSpent
        ),
        formatETH(
          statsB.gasSpent
        )
      );


      compareValues(
        statsA.onchainScore,
        statsB.onchainScore,

        document.getElementById(
          "onchainScoreA"
        ),

        document.getElementById(
          "onchainScoreB"
        ),

        `${statsA.onchainScore} / 100`,

        `${statsB.onchainScore} / 100`
      );


      let winnerText;


      if (
        battleScoreA >
        battleScoreB
      ) {

        winnerText =
          `🏆 Wallet A Wins ${battleScoreA}:${battleScoreB}`;

        winnerBox.innerHTML =
          `
            <div class="winner-title">
              ${winnerText}
            </div>

            <div class="winner-subtitle">
              Stronger onchain activity on Base.
            </div>
          `;

      } else if (
        battleScoreB >
        battleScoreA
      ) {

        winnerText =
          `🏆 Wallet B Wins ${battleScoreB}:${battleScoreA}`;

        winnerBox.innerHTML =
          `
            <div class="winner-title">
              ${winnerText}
            </div>

            <div class="winner-subtitle">
              Stronger onchain activity on Base.
            </div>
          `;

      } else {

        winnerText =
          `🤝 Draw ${battleScoreA}:${battleScoreB}`;

        winnerBox.innerHTML =
          `
            <div class="winner-title">
              ${winnerText}
            </div>

            <div class="winner-subtitle">
              These wallets are evenly matched.
            </div>
          `;
      }


      updateBattleCard(
        statsA,
        statsB,
        winnerText
      );


      prepareBattleCardDownload(
        statsA,
        statsB,
        winnerText
      );


      prepareShare(
        statsA,
        statsB,
        winnerText
      );


      prepareCopyLink(
        statsA,
        statsB
      );


    } catch (error) {

  console.error("Wallet Battle Error:", error);

  showError(
    error?.message ||
    "Could not load wallet data. Please try again."
  );
    } finally {

      compareButton.disabled =
        false;

      compareButton.textContent =
        "⚔ Compare Wallets";
    }
  }
);


[
  walletAInput,
  walletBInput
].forEach(input => {

  input.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {
        compareButton.click();
      }
    }
  );
});


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

    setTimeout(
      () => {
        compareButton.click();
      },
      350
    );
  }
}


loadBattleFromURL();