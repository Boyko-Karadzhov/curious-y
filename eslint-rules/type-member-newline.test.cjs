'use strict';

const { RuleTester } = require('eslint');
const rule = require('./type-member-newline');

const tester = new RuleTester({ parser: require.resolve('@typescript-eslint/parser') });
tester.run('type-member-newline', rule, {
    valid: [
        'type Choice = { text: string };',
        'type Choice = {\n    text: string;\n    feedback: string\n};',
        'interface Choice {\n    text: string;\n    feedback: string\n}',
    ],
    invalid: [
        {
            code: 'type Choice = { text: string; feedback: string };',
            output: 'type Choice = {\n    text: string;\n    feedback: string\n};',
            errors: 3,
        },
        {
            code: 'type Choice = {\n    text: string; feedback: string;\n};',
            output: 'type Choice = {\n    text: string;\n    feedback: string;\n};',
            errors: 1,
        },
        {
            code: 'interface Choice { text: string; feedback: string }',
            output: 'interface Choice {\n    text: string;\n    feedback: string\n}',
            errors: 3,
        },
        {
            code: 'type Choice = { answer: { text: string; feedback: string }; score: number };',
            output: 'type Choice = {\n    answer: {\n        text: string;\n        feedback: string\n    };\n    score: number\n};',
            errors: 6,
        },
    ],
});
