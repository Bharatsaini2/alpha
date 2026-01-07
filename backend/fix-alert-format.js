const fs = require('fs');

// Read the current file
const filePath = 'src/utils/telegram.utils.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the return statement in formatWhaleAlert function
const oldReturn = `return \`🐋 *Whale Alert*

*Wallet:* \\\`\${walletEscaped}\\\`
*Token:* *\${tokenSymbolEscaped}*
*Amount:* *\${escapeMarkdownV2(formattedAmount)} \${tokenSymbolEscaped}*
*USD Value:* *\${escapeMarkdownV2(formattedUSD)}*
*Type:* *\${typeUpper}*

[View Transaction](\${txLink})
[View Token](\${tokenLink})\``;

const newReturn = `return \`🐋 *Whale \${typeUpper} Alert*

*Wallet:* \\\`\${walletEscaped}\\\`
*Token:* *\${tokenSymbolEscaped}*
*Swap:* \${escapeMarkdownV2(formattedAmount)} \${tokenSymbolEscaped} \\\\(\${escapeMarkdownV2(formattedUSD)}\\\\)
*Hotness:* \${tx.hotnessScore || 'N/A'}/10

[📊 View Details](https://alpha-block.ai/transaction/\${tx.signature}?type=whale&transaction=\${tx.type})
[🔍 Solscan](\${txLink})\``;

// Replace the content
const updatedContent = content.replace(
  /return `🐋 \*Whale Alert\*[\s\S]*?\[View Token\]\(\$\{tokenLink\}\)`/,
  newReturn
);

// Write back to file
fs.writeFileSync(filePath, updatedContent);

console.log('✅ Alert format updated successfully!');
console.log('🔄 Restart the backend to see the new format');