<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
// @ts-ignore
import * as d3 from 'd3'
// @ts-ignore
import { sankey as d3Sankey } from 'd3-sankey'

const props = defineProps<{
  sankeyData: { nodes: any[]; links: any[] }
}>()

const emit = defineEmits(['quad-selected'])
const sankeyChart = ref<HTMLElement | null>(null)

// 颜色配置
const colorMap: Record<string, string> = {
  modifyL: '#FFD1E8', // 淡粉
  object: '#5EAEFF', // 天蓝
  action: '#7FFFB2', // 浅绿
  modify: '#FFE670', // 柠檬黄
}

let resizeObserver: ResizeObserver | null = null

// 记录选中的路径状态
const chosen = ref<any>({ left: null, middle: null, right: null })

// 监听数据变化，重新绘制图表
watch(
  () => props.sankeyData,
  (newVal, oldVal) => {
    console.log('Sankey data changed:', newVal)
    if (newVal && newVal.nodes && newVal.nodes.length > 0) {
      drawSankey()
    }
  },
  { deep: true },
)

const drawSankey = () => {
  console.log('Drawing sankey chart with data:', props.sankeyData)

  if (!sankeyChart.value) {
    console.error('Sankey chart container not found')
    return
  }

  if (!props.sankeyData || !props.sankeyData.nodes || !props.sankeyData.nodes.length) {
    console.warn('No data to draw')
    return
  }

  const width = sankeyChart.value.clientWidth
  const height = sankeyChart.value.clientHeight

  if (width <= 0 || height <= 0) {
    console.warn('Invalid chart dimensions:', width, 'x', height)
    return
  }

  console.log('Chart dimensions:', width, 'x', height)

  // 1. 清理
  d3.select(sankeyChart.value).selectAll('*').remove()

  const svg = d3
    .select(sankeyChart.value)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .style('display', 'block')
    .attr('viewBox', `0 0 ${width} ${height}`)

  // 添加defs元素用于定义渐变
  const defs = svg.append('defs')

  // 2. 布局配置
  const nodeWidth = 24
  const nodePadding = Math.min(40, height / (props.sankeyData.nodes.length / 2))

  // 调整布局，让节点贴近边缘
  const sankeyGen = d3Sankey()
    .nodeWidth(nodeWidth)
    .nodePadding(nodePadding)
    .nodeAlign((node: any) => {
      const orders: any = { modifyL: 0, object: 1, action: 2, modify: 3 }
      return orders[node.type] ?? 0
    })
    .extent([
      [10, 10],
      [width - 10, height - 10],
    ])

  // 3. 数据转换
  const layerOrder: Record<string, number> = { modifyL: 0, object: 1, action: 2, modify: 3 }
  const nodes = props.sankeyData.nodes.map((d) => ({ ...d }))
  const nodeMap = new Map(nodes.map((d, i) => [d.name, { index: i, node: d }]))
  // 过滤会形成环的 link：只保留 source.layer < target.layer 的边
  const validLinks = props.sankeyData.links.filter((l) => {
    const src = nodeMap.get(l.source)?.node
    const tgt = nodeMap.get(l.target)?.node
    if (!src || !tgt) return false
    const srcLayer = layerOrder[src.type] ?? 0
    const tgtLayer = layerOrder[tgt.type] ?? 3
    return srcLayer < tgtLayer
  })
  const links = validLinks.map((l) => ({
    source: nodeMap.get(l.source)!.index,
    target: nodeMap.get(l.target)!.index,
    value: 1,
    description: l.description,
  }))

  const graph = sankeyGen({ nodes, links })

  console.log('Graph generated:', graph)

  // 4. 定义双向等分丝带生成器 (解决连线长度/宽度不平齐的关键)
  const sankeyRibbonBilateral = (d: any) => {
    const x0 = d.source.x1,
      x1 = d.target.x0
    const sLinks = d.source.sourceLinks
    const tLinks = d.target.targetLinks

    // 计算均分后的单条边厚度
    const w0 = (d.source.y1 - d.source.y0) / Math.max(1, sLinks.length)
    const w1 = (d.target.y1 - d.target.y0) / Math.max(1, tLinks.length)

    const sIdx = sLinks.indexOf(d)
    const tIdx = tLinks.indexOf(d)

    const y0 = d.source.y0 + sIdx * w0 + w0 / 2
    const y1 = d.target.y0 + tIdx * w1 + w1 / 2

    const cp = (x1 - x0) / 2
    return `M${x0},${y0 - w0 / 2} C${x0 + cp},${y0 - w0 / 2} ${x1 - cp},${y1 - w1 / 2} ${x1},${y1 - w1 / 2} L${x1},${y1 + w1 / 2} C${x1 - cp},${y1 + w1 / 2} ${x0 + cp},${y0 + w0 / 2} ${x0},${y0 + w0 / 2} Z`
  }

  // 5. 绘制连线
  const linkG = svg
    .append('g')
    .selectAll('path')
    .data(graph.links)
    .enter()
    .append('path')
    .attr('d', sankeyRibbonBilateral)
    .attr('fill', '#ababab')
    .attr('fill-opacity', 0.15)
    .on('click', function (event: MouseEvent, d: any) {
      handleLinkClick(this, d, defs)
    })

  // 6. 绘制节点
  const nodeG = svg
    .append('g')
    .selectAll('rect')
    .data(graph.nodes)
    .enter()
    .append('rect')
    .attr('x', (d: any) => d.x0)
    .attr('y', (d: any) => d.y0)
    .attr('height', (d: any) => d.y1 - d.y0)
    .attr('width', (d: any) => d.x1 - d.x0)
    .attr('fill', (d: any) => colorMap[d.type] || '#ccc')
    .attr('rx', 0)

  // 7. 节点文字
  svg
    .append('g')
    .selectAll('text')
    .data(graph.nodes)
    .enter()
    .append('text')
    // 右侧两个节点（action和modify）的文字显示在左边，其他节点文字显示在右边
    .attr('x', (d: any) => {
      const nodeType = d.type || d.data?.type
      // action和modify类型的节点文字显示在左边
      if (nodeType === 'action' || nodeType === 'modify') {
        return d.x0 - 8
      }
      // 其他节点文字显示在右边
      return d.x1 + 8
    })
    .attr('y', (d: any) => (d.y0 + d.y1) / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', (d: any) => {
      const nodeType = d.type || d.data?.type
      // action和modify类型的节点文字右对齐
      if (nodeType === 'action' || nodeType === 'modify') {
        return 'end'
      }
      // 其他节点文字左对齐
      return 'start'
    })
    .style('font-size', '12px')
    .style('fill', '#333')
    .text((d: any) => d.name)

  console.log('Sankey chart drawn successfully')
}

// 获取链接的唯一标识符
function getLinkId(d: any) {
  return `${d.source.name || d.source.data?.name}-${d.target.name || d.target.data?.name}`
}

// 交互逻辑
function handleLinkClick(el: any, d: any, defs: any) {
  const side = getSide(d)
  if (!side) return

  // 获取当前链接的唯一标识符
  const currentLinkId = getLinkId(d)
  // 获取已选中链接的唯一标识符
  const selectedLinkId = chosen.value[side] ? getLinkId(chosen.value[side]) : null
  // 检查是否是同一条链接
  const isSame = currentLinkId === selectedLinkId

  // 重置该侧所有链接的样式
  d3.selectAll('path')
    .filter((ld: any) => getSide(ld) === side)
    .attr('fill', '#ababab')
    .attr('fill-opacity', 0.15)

  if (isSame) {
    // 取消选中
    chosen.value[side] = null
  } else {
    // 选中当前链接
    chosen.value[side] = d

    // 获取源节点和目标节点的类型
    const sourceType = d.source.type || d.source.data?.type
    const targetType = d.target.type || d.target.data?.type

    // 获取对应的颜色，使用默认值防止undefined
    const sourceColor = colorMap[sourceType] || '#7FFFB2'
    const targetColor = colorMap[targetType] || '#FFE670'

    // 创建渐变ID
    const gradientId = `gradient-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // 移除已存在的同名渐变
    defs.select(`#${gradientId}`).remove()

    // 创建线性渐变
    const gradient = defs
      .append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%')

    // 添加渐变停止点
    gradient.append('stop').attr('offset', '0%').attr('stop-color', sourceColor)
    gradient.append('stop').attr('offset', '100%').attr('stop-color', targetColor)

    // 使用渐变填充
    d3.select(el).attr('fill', `url(#${gradientId})`).attr('fill-opacity', 0.8)
  }

  checkAndEmit()
}

const getSide = (d: any) => {
  if (!d || !d.source || !d.target) return null
  // 确保能够正确访问节点的type属性
  const sourceType = d.source.type || d.source.data?.type
  const targetType = d.target.type || d.target.data?.type

  if (sourceType === 'modifyL' && targetType === 'object') return 'left'
  if (sourceType === 'object' && targetType === 'action') return 'middle'
  if (sourceType === 'action' && targetType === 'modify') return 'right'
  return null
}

const checkAndEmit = () => {
  const { left, middle, right } = chosen.value
  if (left && middle && right) {
    // 验证逻辑：中间节点的名称必须匹配 (ModL->Obj1, Obj1->Act1, Act1->ModR)
    if (left.target.name === middle.source.name && middle.target.name === right.source.name) {
      emit('quad-selected', {
        modifyL: left.source.name,
        object: middle.source.name,
        action: middle.target.name,
        modify: right.target.name,
      })
    }
  }
}

let timer: any = null
onMounted(() => {
  // 初始渲染
  setTimeout(() => {
    drawSankey()
  }, 100)

  // 监听尺寸变化
  resizeObserver = new ResizeObserver((entries) => {
    // 只有当尺寸真的发生显著变化时才重绘
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      drawSankey()
    }, 150) // 150ms 防抖，防止死循环
  })

  if (sankeyChart.value) resizeObserver.observe(sankeyChart.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div class="sankey-container" ref="sankeyChart"></div>
</template>

<style scoped>
.sankey-container {
  width: 100%;
  height: 100%;
  position: relative;
  /* 强制隐藏任何溢出，切断 ResizeObserver 的死循环 */
  overflow: hidden;
}

:deep(svg) {
  /* 使用 absolute 布局让 SVG 浮在容器上，不撑开父级 */
  position: absolute;
  top: 0;
  left: 0;
  display: block;
}
:deep(path) {
  cursor: pointer;
  transition: fill-opacity 0.2s;
}
</style>
