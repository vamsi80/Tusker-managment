const fs = require('fs');
const { execSync } = require('child_process');

try {
    const output = execSync('npx eslint . --format json', { maxBuffer: 10 * 1024 * 1024 });
    const results = JSON.parse(output.toString());
    
    results.forEach(file => {
        if (file.messages.length > 0) {
            console.log(`FILE: ${file.filePath}`);
            file.messages.forEach(msg => {
                console.log(`  L${msg.line}:${msg.column} [${msg.ruleId}] ${msg.message}`);
            });
        }
    });
} catch (e) {
    if (e.stdout) {
        const results = JSON.parse(e.stdout.toString());
        results.forEach(file => {
            if (file.messages.length > 0) {
                console.log(`FILE: ${file.filePath}`);
                file.messages.forEach(msg => {
                    console.log(`  L${msg.line}:${msg.column} [${msg.ruleId}] ${msg.message}`);
                });
            }
        });
    }
}
