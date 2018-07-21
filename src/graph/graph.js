import slateValueToJSON from './slateCustomToJson'
import createOperationEmitter from './operationEmitter'

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
    console.log(`Getting document ${nodeId}`);
    const node = gun
      .get(nodeId)
      .once(nodeData => {
        // console.log('recieved block', { nodeData });
        gun.get(nodeId).get('childBlocks').once((childNodes) => {
          console.log(`Recieved child nodes from ${nodeId}`, { childNodes });
          const slateNode = JSON.parse(nodeData.slateData)

          if (childNodes) {
            slateNode.nodes = []
            const getChildNodeTrees = Object.keys(childNodes)
              .filter(key => key !== '_')
              .map(childNodeId => cb => {
                console.log({ childNodeId });
                getDocument(childNodeId, cb)
              })

            batch(getChildNodeTrees, childNodeTrees => {
              childNodeTrees.forEach((childNodeTree, i) => {
                slateNode.nodes[i] = childNodeTree
              })
              console.log(`emitting node`, slateNode);
              cb(slateNode)
            })
          } else {
            cb(slateNode)
          }
        })
      })
  }
  self.getDocument = getDocument

  const insertBlockFromJSON = (block, parentId) => {
    const {
      nodes,
      ...blockData
    } = block

    const blockId = (block.key && `BLOCK_${block.key}`) // todo use uuid
      || `DOCUMENT_${genId()}` // todo use uuid
    console.log(`Generated id ${blockId}`);

    const slateData = {
      ...blockData,
      data: {
        ...blockData.data,
        id: blockId
      }
    }
    if (slateData.object === 'text') {
      slateData.leaves = slateData.leaves.map(leaf => ({...leaf, text: leaf.text.join('')}))
    }
    const slateDataJSON = JSON.stringify(slateData)
    const node = gun
      .get(blockId)
      .put({ slateData: slateDataJSON })
    //
    if (parentId !== undefined) {
      console.log(`SETTING ${blockId} as child of ${parentId}`);
      gun
        .get(parentId)
        .get('childBlocks')
        .set(node)
    }

    ;(block.nodes || []).forEach(childBlock => {
      insertBlockFromJSON(childBlock, blockId)
    })

    return blockId
  }

  const updateNode = (nodeId, update) => {
    const node = gun
      .get(nodeId)
      .once(nodeData => {
        const slateData = JSON.parse(nodeData.slateData)
        gun.get(nodeId).put({
          ...nodeData,
          slateData: JSON.stringify(update(slateData))
        })
      })
  }

  const insertText = (nodeId, offset, text) => {
    updateNode(nodeId, nodeData => {
      const oldText = nodeData.leaves[0].text
      console.log();
      return {
        ...nodeData,
        leaves: [
          {
            ...nodeData.leaves[0],
            text: oldText.slice(0, offset) + text + oldText.slice(offset)
          }
        ]
      }
    })
  }
  self.insertText = insertText

  const updateValue = (docId, change, cb) => {
    emitOperations(change.operations, change.value)

    getDocument(docId, cb)
  }
  self.updateValue = updateValue

  const insertBlock = (value, parentId) => {
    return insertBlockFromJSON(slateValueToJSON(value), parentId)
  }
  self.insertBlock = insertBlock

  const insertDocument = value => {
    console.log(`inserting document`);
    return insertBlockFromJSON(slateValueToJSON(value).document)
  }
  self.insertDocument = insertDocument

  const emitOperations = createOperationEmitter(self)
  self.emitOperations = emitOperations

  return self
}

export default createGraph
