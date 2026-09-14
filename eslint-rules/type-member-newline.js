'use strict';

function reportMissingBreak(context, node, left, right, indentation) {
    if (left.loc.end.line !== right.loc.start.line) {
        return;
    }

    const gap = context.sourceCode.text.slice(left.range[1], right.range[0]);
    context.report({
        node,
        loc: right.loc,
        messageId: 'separate',
        fix(fixer) {
            if (gap.trim()) {
                return null;
            }

            return fixer.replaceTextRange([left.range[1], right.range[0]], `\n${indentation}`);
        },
    });
}

function memberIndentation(source, members, base) {
    const existing = members.map(member =>
        source.lines[member.loc.start.line - 1].slice(0, member.loc.start.column)
    ).find(prefix => prefix.length > base.length && /^\s+$/.test(prefix));
    return existing || `${base}    `;
}

function baseIndentation(source, node) {
    const owner = node.parent?.parent;
    const container = owner?.parent;
    if (owner?.type === 'TSPropertySignature' && container?.type === 'TSTypeLiteral') {
        return memberIndentation(source, container.members, baseIndentation(source, container));
    }

    return source.lines[node.loc.start.line - 1].match(/^\s*/)[0];
}

function checkMembers(context, node, members) {
    if (members.length < 2) {
        return;
    }

    const source = context.sourceCode;
    const base = baseIndentation(source, node);
    const indentation = memberIndentation(source, members, base);
    reportMissingBreak(context, node, source.getFirstToken(node), source.getFirstToken(members[0]), indentation);
    for (let index = 1; index < members.length; index++) {
        const current = source.getFirstToken(members[index]);
        reportMissingBreak(context, node, source.getTokenBefore(current), current, indentation);
    }

    const close = source.getLastToken(node);
    reportMissingBreak(context, node, source.getTokenBefore(close), close, base);
}

module.exports = {
    meta: {
        type: 'layout',
        fixable: 'whitespace',
        messages: { separate: 'Type members must each be on a new line.' },
    },
    create(context) {
        return {
            TSTypeLiteral(node) {
                checkMembers(context, node, node.members);
            },
            TSInterfaceBody(node) {
                checkMembers(context, node, node.body);
            },
        };
    },
};
