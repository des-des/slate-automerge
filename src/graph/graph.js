import slateValueToJSON from './slateCustomToJson'
const Gun = require('gun');
const genId = (() => {
  let counter = 0

  return () => {
    return counter++
  }
})()

const createGraph = () => {
  const self = {}

  const gun = new Gun()

  const batch = (tasks, cb) => {
    let count = 0
    const results = []
    tasks.forEach((task, i) => {
      task(result => {
        results[i] = result

        count++
        if (count >= tasks.length) {
          cb(results)
        }
      })
    })
  }

  const getDocument = (nodeId, cb) => {
    const node = gun
      .get(nodeId)
      .once(nodeData => {
        // console.log('recieved block', { nodeData });
        node.get('childBlocks').once((childNodes) => {
          console.log();
          console.log(`Recieved child nodes from ${nodeId}`, { childNodes });
          const slateNode = JSON.parse(nodeData.slateData)

          if (childNodes) {
            slateNode.blocks = []
            const getChildNodeTrees = Object.keys(childNodes)
              .filter(key => key !== '_')
              .map(childNodeId => cb => {
                console.log({ childNodeId });
                getDocument(childNodeId, cb)
              })

            batch(getChildNodeTrees, childNodeTrees => {
              childNodeTrees.forEach((childNodeTree, i) => {
                slateNode.blocks[i] = childNodeTree
              })

              cb(slateNode)
            })
          } else {
            cb(slateNode)
          }
        })
      })
  }
  self.getDocument = getDocument

  const insertBlock = (block, parentId) => {
    const {
      nodes,
      ...slateData
    } = block

    const blockId = `BLOCK_${genId()}` // todo use uuids
    console.log(`Generated id ${blockId}`);
    const node = gun
      .get(blockId)
      .put({ slateData: JSON.stringify(slateData) })
    //
    if (parentId !== undefined) {
      console.log(`SETTING ${blockId} as child of ${parentId}`);
      gun
        .get(parentId)
        .get('childBlocks')
        .set(node)
    }

    ;(block.nodes || []).forEach(childBlock => {
      insertBlock(childBlock, blockId)
    })

    return blockId
  }

  const insertDocument = value => {
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!1');
    console.log('>>>', slateValueToJSON(value).document);
    return insertBlock(slateValueToJSON(value).document)
  }
  self.insertDocument = insertDocument

  return self
}

export default createGraph
