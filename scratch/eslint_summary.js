const fs = require('fs');
const { execSync } = require('child_process');

try {
    console.log("Running eslint...");
    const output = execSync('npx eslint . --format json', { maxBuffer: 10 * 1024 * 1024 });
    const results = JSON.parse(output.toString());
    
    const errors = {};
    results.forEach(file => {
        file.messages.forEach(msg => {
            const key = msg.ruleId || 'unknown';
            errors[key] = (errors[key] || 0) + 1;
        });
    });
    
    console.log(JSON.stringify(errors, null, 2));
} catch (e) {
    if (e.stdout) {
        const results = JSON.parse(e.stdout.toString());
        const errors = {};
        results.forEach(file => {
            file.messages.forEach(msg => {
                const key = msg.ruleId || 'unknown';
                errors[key] = (errors[key] || 0) + 1;
            });
        });
        console.log(JSON.stringify(errors, null, 2));
    } else {
        console.error(e);
    }
}
