const DIMENSIONS = 768;

export function testEmbeddings(nodes) {
  return nodes.filter(node => node.kind === 'concept').map((node, index) => {
    const embedding = Array.from({ length: DIMENSIONS }, () => 0);
    embedding[index % DIMENSIONS] = 1;
    return { nodeId: node.id, embedding };
  });
}
