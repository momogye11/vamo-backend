#!/usr/bin/env node

/**
 * Script pour exécuter tous les tests et générer des rapports
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

class TestRunner {
    constructor() {
        this.results = {
            start: new Date(),
            suites: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                coverage: null
            }
        };
    }

    log(message, color = 'reset') {
        console.log(`${colors[color]}${message}${colors.reset}`);
    }

    async runTestSuite(name, command, description) {
        this.log(`\n${colors.bright}🧪 Running ${name}${colors.reset}`, 'cyan');
        this.log(`📝 ${description}`, 'blue');
        
        const start = Date.now();
        let success = false;
        let output = '';
        let error = '';

        try {
            output = execSync(command, { 
                encoding: 'utf8',
                cwd: path.join(__dirname, '..'),
                stdio: 'pipe'
            });
            success = true;
            this.log(`✅ ${name} completed successfully`, 'green');
        } catch (err) {
            error = err.message;
            output = err.stdout || '';
            this.log(`❌ ${name} failed`, 'red');
            if (err.stdout) {
                console.log(err.stdout);
            }
            if (err.stderr) {
                console.error(err.stderr);
            }
        }

        const duration = Date.now() - start;
        
        this.results.suites.push({
            name,
            description,
            success,
            duration,
            output,
            error
        });

        return success;
    }

    parseJestOutput(output) {
        const lines = output.split('\n');
        let summary = {
            tests: 0,
            passed: 0,
            failed: 0,
            skipped: 0
        };

        // Chercher la ligne de résumé Jest
        const summaryLine = lines.find(line => line.includes('Tests:'));
        if (summaryLine) {
            const match = summaryLine.match(/(\d+) passed/);
            if (match) summary.passed = parseInt(match[1]);
            
            const failMatch = summaryLine.match(/(\d+) failed/);
            if (failMatch) summary.failed = parseInt(failMatch[1]);
            
            const skipMatch = summaryLine.match(/(\d+) skipped/);
            if (skipMatch) summary.skipped = parseInt(skipMatch[1]);
            
            summary.tests = summary.passed + summary.failed + summary.skipped;
        }

        return summary;
    }

    async generateReport() {
        const duration = Date.now() - this.results.start.getTime();
        
        // Calculer les totaux
        this.results.suites.forEach(suite => {
            if (suite.output) {
                const parsed = this.parseJestOutput(suite.output);
                this.results.summary.total += parsed.tests;
                this.results.summary.passed += parsed.passed;
                this.results.summary.failed += parsed.failed;
                this.results.summary.skipped += parsed.skipped;
            }
        });

        // Générer le rapport texte
        const report = this.generateTextReport(duration);
        
        // Sauvegarder le rapport
        const reportPath = path.join(__dirname, '..', 'test-results.txt');
        fs.writeFileSync(reportPath, report);
        
        // Générer le rapport JSON
        const jsonReport = {
            ...this.results,
            end: new Date(),
            duration,
            summary: this.results.summary
        };
        
        const jsonPath = path.join(__dirname, '..', 'test-results.json');
        fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

        this.log(`\n📊 Reports generated:`, 'magenta');
        this.log(`   📄 Text report: ${reportPath}`, 'blue');
        this.log(`   📋 JSON report: ${jsonPath}`, 'blue');

        return report;
    }

    generateTextReport(duration) {
        const report = [];
        
        report.push('🧪 VAMO BACKEND - TEST RESULTS REPORT');
        report.push('=' .repeat(50));
        report.push(`📅 Date: ${this.results.start.toLocaleDateString('fr-FR')}`);
        report.push(`⏰ Time: ${this.results.start.toLocaleTimeString('fr-FR')}`);
        report.push(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
        report.push('');

        // Résumé global
        report.push('📊 GLOBAL SUMMARY');
        report.push('-'.repeat(30));
        report.push(`Total Tests: ${this.results.summary.total}`);
        report.push(`✅ Passed: ${this.results.summary.passed}`);
        report.push(`❌ Failed: ${this.results.summary.failed}`);
        report.push(`⏭️  Skipped: ${this.results.summary.skipped}`);
        
        if (this.results.summary.total > 0) {
            const passRate = ((this.results.summary.passed / this.results.summary.total) * 100).toFixed(1);
            report.push(`📈 Pass Rate: ${passRate}%`);
        }
        report.push('');

        // Détails par suite
        report.push('📋 DETAILED RESULTS BY SUITE');
        report.push('-'.repeat(40));
        
        this.results.suites.forEach(suite => {
            const status = suite.success ? '✅ PASS' : '❌ FAIL';
            const durationSec = (suite.duration / 1000).toFixed(2);
            
            report.push(`${status} ${suite.name} (${durationSec}s)`);
            report.push(`    📝 ${suite.description}`);
            
            if (suite.output) {
                const parsed = this.parseJestOutput(suite.output);
                report.push(`    🔢 Tests: ${parsed.tests} | Passed: ${parsed.passed} | Failed: ${parsed.failed}`);
            }
            
            if (!suite.success && suite.error) {
                report.push(`    ❌ Error: ${suite.error.split('\n')[0]}`);
            }
            report.push('');
        });

        // Recommandations
        report.push('💡 RECOMMENDATIONS');
        report.push('-'.repeat(25));
        
        if (this.results.summary.failed > 0) {
            report.push('🚨 Some tests are failing:');
            report.push('   - Review failed test output above');
            report.push('   - Fix issues before deployment');
            report.push('   - Consider adding more edge case tests');
        } else {
            report.push('🎉 All tests passing! Great job!');
            report.push('   - Consider adding more test coverage');
            report.push('   - Review test performance for optimization');
        }
        
        report.push('');
        report.push('🔍 NEXT STEPS');
        report.push('-'.repeat(15));
        report.push('1. Review any failing tests and fix issues');
        report.push('2. Check test coverage and add missing tests');
        report.push('3. Optimize slow-running tests if needed');
        report.push('4. Update documentation based on test results');
        report.push('');
        
        report.push('📚 USEFUL COMMANDS');
        report.push('-'.repeat(20));
        report.push('npm test                    # Run all tests');
        report.push('npm run test:watch          # Run tests in watch mode');
        report.push('npm run test:coverage       # Run with coverage report');
        report.push('npm test -- --verbose       # Run with detailed output');
        report.push('npm test auth.test.js       # Run specific test file');

        return report.join('\n');
    }

    async run() {
        this.log('🚀 Starting Vamo Backend Test Suite', 'bright');
        this.log('=' .repeat(50), 'cyan');

        const testSuites = [
            {
                name: 'Unit Tests - Authentication',
                command: 'npm test tests/unit/auth.test.js',
                description: 'Tests OTP generation, validation, and phone number verification'
            },
            {
                name: 'Unit Tests - Pricing',
                command: 'npm test tests/unit/pricing.test.js',
                description: 'Tests fare calculations, distance algorithms, and payment methods'
            },
            {
                name: 'Unit Tests - Trip Management',
                command: 'npm test tests/unit/trips.test.js',
                description: 'Tests trip lifecycle, status updates, and driver assignment'
            },
            {
                name: 'Integration Tests',
                command: 'npm test tests/integration/api.test.js',
                description: 'End-to-end API tests covering complete user flows'
            }
        ];

        let allPassed = true;

        for (const suite of testSuites) {
            const success = await this.runTestSuite(suite.name, suite.command, suite.description);
            if (!success) {
                allPassed = false;
            }
        }

        // Générer le rapport final
        this.log('\n🎯 Generating final report...', 'magenta');
        const report = await this.generateReport();

        // Affichage du résumé final
        this.log('\n📊 FINAL SUMMARY', 'bright');
        this.log('=' .repeat(30), 'cyan');
        
        if (allPassed) {
            this.log('🎉 ALL TEST SUITES PASSED!', 'green');
            this.log(`✅ Total: ${this.results.summary.passed} tests passed`, 'green');
        } else {
            this.log('⚠️  SOME TESTS FAILED', 'yellow');
            this.log(`❌ Failed: ${this.results.summary.failed} tests`, 'red');
            this.log(`✅ Passed: ${this.results.summary.passed} tests`, 'green');
        }

        if (this.results.summary.total > 0) {
            const passRate = ((this.results.summary.passed / this.results.summary.total) * 100).toFixed(1);
            this.log(`📈 Overall Pass Rate: ${passRate}%`, passRate >= 80 ? 'green' : 'yellow');
        }

        const totalDuration = Date.now() - this.results.start.getTime();
        this.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`, 'blue');

        this.log('\n🏁 Test run completed!', 'bright');
        process.exit(allPassed ? 0 : 1);
    }
}

// Exécuter si appelé directement
if (require.main === module) {
    const runner = new TestRunner();
    runner.run().catch(error => {
        console.error('❌ Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = TestRunner;