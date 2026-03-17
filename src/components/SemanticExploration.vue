<script setup lang="ts">
import { ref, computed } from 'vue'
import SankeyDiagram from '../components/SankeyDiagram.vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  rawResults: {
    objectModifies: string[]
    objects: string[]
    actions: string[]
    actionModifies: string[]
  }
  sankeyData?: {
    nodes: { name: string; type?: string }[]
    links: { source: string; target: string; value: number; description?: string }[]
  } | null
}>()

const emit = defineEmits(['pathConfirmed', 'sankey-data'])

// 状态管理
const isLoading = ref(false)
const error = ref('')

// 数据转换：将原始数组转换为 D3 Sankey 格式
const sankeyData = computed(() => {
  // 优先使用后端返回的 sankeyData
  if (props.sankeyData && props.sankeyData.nodes && props.sankeyData.nodes.length > 0) {
    return props.sankeyData
  }

  // 否则使用旧的转换逻辑
  const nodes: any[] = []
  const links: any[] = []

  // 1. 生成节点
  const map = [
    { items: props.rawResults.objectModifies, type: 'modifyL' },
    { items: props.rawResults.objects, type: 'object' },
    { items: props.rawResults.actions, type: 'action' },
    { items: props.rawResults.actionModifies, type: 'modify' },
  ]

  map.forEach((group) => {
    group.items.forEach((name) => nodes.push({ name, type: group.type }))
  })

  // 2. 生成连线 (笛卡尔积连接相邻层级)
  const connect = (srcs: string[], tgts: string[]) => {
    srcs.forEach((s) => {
      tgts.forEach((t) => {
        links.push({ source: s, target: t, value: 1 })
      })
    })
  }

  connect(props.rawResults.objectModifies, props.rawResults.objects)
  connect(props.rawResults.objects, props.rawResults.actions)
  connect(props.rawResults.actions, props.rawResults.actionModifies)

  return { nodes, links }
})

// 判断是否有数据可以显示
const hasData = computed(() => {
  // 优先检查后端返回的 sankeyData
  if (props.sankeyData && props.sankeyData.nodes && props.sankeyData.nodes.length > 0) {
    return true
  }
  // 否则检查 rawResults
  return props.rawResults.objects.length > 0
})

// 调用后端API进行推理
const inferFromBackend = async (query: string) => {
  isLoading.value = true
  error.value = ''

  try {
    const res = await axios.post('http://localhost:8888/semanticDivergence', {
      input: query,
    })

    if (res.data && res.data.sankeyData) {
      ElMessage.success('Inference successful, the chart has been updated.')
      return res.data
    } else {
      ElMessage.warning('Inference successful, but the returned data is empty.')
      return null
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
    error.value = errorMessage
    ElMessage.error('Inference failed: ' + (err.response?.data?.message || errorMessage))
    console.error('Error during inference:', err)
    return null
  } finally {
    isLoading.value = false
  }
}

// 处理用户查询
const handleQuery = async (query: string) => {
  const result = await inferFromBackend(query)
  if (result && result.sankeyData) {
    // 触发事件，通知父组件更新数据
    emit('sankey-data', result.sankeyData)
    console.log('Inference result:', result)
  }
}

const handleSelection = (quad: any) => {
  console.log('用户选中完整路径:', quad)
  emit('pathConfirmed', quad)
}
</script>

<template>
  <div class="semantic-wrapper">
    <!-- 加载状态 -->
    <div v-if="isLoading" class="empty-holder">
      <div class="loading-spinner"></div>
      <p>Processing inference...</p>
    </div>

    <!-- 错误信息 -->
    <div v-else-if="error" class="empty-holder error">
      <p>{{ error }}</p>
      <button class="retry-btn" @click="$emit('retry')">Retry</button>
    </div>

    <!-- 桑基图 -->
    <div v-else-if="hasData" class="chart-box">
      <SankeyDiagram :sankey-data="sankeyData" @quad-selected="handleSelection" />
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-holder">
      <p>Waiting for inference results...</p>
    </div>
  </div>
</template>

<style scoped>
.semantic-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
}
.chart-box {
  flex: 1;
  width: 100%;
  height: 100%;
}
.empty-holder {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #999;
  gap: 16px;
}

/* 加载状态样式 */
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* 错误状态样式 */
.empty-holder.error {
  color: #e74c3c;
}

.retry-btn {
  padding: 8px 16px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s ease;
}

.retry-btn:hover {
  background-color: #2980b9;
}
</style>
