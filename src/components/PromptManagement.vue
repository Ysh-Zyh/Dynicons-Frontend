<script setup lang="ts">
import { ref, computed } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  selectedQuad: {
    modifyL: string
    object: string
    action: string
    modify: string
  } | null
}>()

const emit = defineEmits(['generate'])

const isLoading = ref(false)

// 拖拽状态
const draggedItem = ref<{ sequenceId: string; index: number } | null>(null)
const dragOverSequenceId = ref<string | null>(null)
const dragOverIndex = ref<number | null>(null)

// 生成的提示词序列列表
const promptSequences = ref<
  Array<{
    id: string
    quad: any
    prompts: Array<{
      id: string
      text: string
      isSelected: boolean
      isEditing: boolean
      editText: string
    }>
    isExpanded: boolean
  }>
>([])

// 监听选中的四元组变化，生成提示词序列
import { watch } from 'vue'

watch(
  () => props.selectedQuad,
  (newQuad) => {
    if (newQuad) {
      generateFramePrompts()
    }
  },
  { immediate: true, deep: true },
)

// 生成提示词集合
const generateFramePrompts = async () => {
  if (!props.selectedQuad) {
    return
  }

  isLoading.value = true

  try {
    // 调用后端接口获取完整的提示词集合
    const response = await axios.post(
      `${import.meta.env.DEV ? '/api' : 'http://localhost:8889'}/framePrompt`,
      {
        modifyL: props.selectedQuad.modifyL,
        object: props.selectedQuad.object,
        action: props.selectedQuad.action,
        modify: props.selectedQuad.modify,
      },
      { headers: { 'Content-Type': 'application/json' } },
    )

    console.log('Response from backend:', response.data)

    if (response.data?.status === 'ok' && Array.isArray(response.data.prompts)) {
      const prompts = response.data.prompts
      const quad = props.selectedQuad

      const existingSequence = promptSequences.value.find(
        (seq) =>
          seq.quad.modifyL === quad.modifyL &&
          seq.quad.object === quad.object &&
          seq.quad.action === quad.action &&
          seq.quad.modify === quad.modify,
      )

      if (existingSequence) {
        // 更新现有的序列
        existingSequence.prompts = prompts.map((text, index) => ({
          id: `frame${index + 1}`,
          text,
          isSelected: false,
          isEditing: false,
          editText: text,
        }))
      } else {
        // 创建新的序列
        const promptObjects = prompts.map((text, index) => ({
          id: `frame${index + 1}`,
          text,
          isSelected: false,
          isEditing: false,
          editText: text,
        }))

        const newSequence = {
          id: `sequence-${Date.now()}`,
          quad,
          prompts: promptObjects,
          isExpanded: true,
        }

        promptSequences.value.push(newSequence)
      }

      ElMessage.success(`${prompts.length} Frame Prompts have been generated`)
    } else {
      ElMessage.warning('No prompts were generated')
    }
  } catch (err) {
    console.error('生成提示词失败:', err)
    ElMessage.error('Generation failed: ' + (err.response?.data?.message || err.message))
  } finally {
    isLoading.value = false
  }
}

// 添加新的关键帧
const addKeyframe = (sequenceId: string) => {
  const sequence = promptSequences.value.find((seq) => seq.id === sequenceId)
  if (sequence) {
    const newIndex = sequence.prompts.length + 1
    sequence.prompts.push({
      id: `frame${newIndex}`,
      text: 'New keyframe prompt',
      isSelected: false,
      isEditing: true, // 直接进入编辑模式
      editText: 'New keyframe prompt',
    })
  }
}

// 拖拽开始
const handleDragStart = (sequenceId: string, index: number, event: DragEvent) => {
  draggedItem.value = { sequenceId, index }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${sequenceId}-${index}`)
  }
}

// 拖拽经过
const handleDragOver = (sequenceId: string, index: number, event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dragOverSequenceId.value = sequenceId
  dragOverIndex.value = index
}

// 拖拽离开
const handleDragLeave = () => {
  dragOverSequenceId.value = null
  dragOverIndex.value = null
}

// 拖拽放下
const handleDrop = (targetSequenceId: string, targetIndex: number, event: DragEvent) => {
  event.preventDefault()

  if (!draggedItem.value) return

  const { sequenceId: sourceSequenceId, index: sourceIndex } = draggedItem.value

  // 找到源序列和目标序列
  const sourceSequence = promptSequences.value.find((seq) => seq.id === sourceSequenceId)
  const targetSequence = promptSequences.value.find((seq) => seq.id === targetSequenceId)

  if (!sourceSequence || !targetSequence) return

  // 获取被拖拽的提示词
  const draggedPrompt = sourceSequence.prompts[sourceIndex]

  // 从源位置移除
  sourceSequence.prompts.splice(sourceIndex, 1)

  // 插入到目标位置
  targetSequence.prompts.splice(targetIndex, 0, draggedPrompt)

  // 重新编号所有提示词
  renumberPrompts()

  // 重置拖拽状态
  draggedItem.value = null
  dragOverSequenceId.value = null
  dragOverIndex.value = null

  ElMessage.success('Keyframe moved successfully')
}

// 重新编号所有提示词
const renumberPrompts = () => {
  promptSequences.value.forEach((sequence) => {
    sequence.prompts.forEach((prompt, index) => {
      prompt.id = `frame${index + 1}`
    })
  })
}

// 切换序列展开/折叠状态
const toggleSequenceExpansion = (sequenceId: string) => {
  const sequence = promptSequences.value.find((seq) => seq.id === sequenceId)
  if (sequence) {
    sequence.isExpanded = !sequence.isExpanded
  }
}

// 切换提示词选中状态
const togglePromptSelection = (sequenceId: string, promptId: string) => {
  const sequence = promptSequences.value.find((seq) => seq.id === sequenceId)
  if (sequence) {
    const selectedPrompt = sequence.prompts.find((prompt) => prompt.id === promptId)
    if (selectedPrompt && selectedPrompt.isSelected) {
      // 如果点击的是已经选中的卡片，取消选中
      selectedPrompt.isSelected = false
    } else {
      // 否则，选中当前卡片，取消其他卡片的选中状态
      sequence.prompts.forEach((prompt) => {
        prompt.isSelected = prompt.id === promptId
      })
    }
  }
}

// 获取选中的提示词
const selectedPrompt = computed(() => {
  for (const sequence of promptSequences.value) {
    const selected = sequence.prompts.find((p) => p.isSelected)
    if (selected) {
      return selected
    }
  }
  return undefined
})

// 获取选中的提示词类型
const selectedPromptType = computed(() => {
  for (const sequence of promptSequences.value) {
    const index = sequence.prompts.findIndex((p) => p.isSelected)
    if (index !== -1) {
      return `Frame ${index + 1}`
    }
  }
  return 'Frame 1'
})

// 检查是否可以生成
const canGenerate = computed(() => {
  return selectedPrompt.value !== undefined
})

// 处理生成按钮点击（编辑中用 editText，否则用 text）
const handleGenerate = () => {
  if (!canGenerate.value || !selectedPrompt.value) return
  const p = selectedPrompt.value
  const promptText = (p.isEditing ? p.editText : p.text) ?? p.text ?? ''
  if (!promptText.trim()) {
    ElMessage.warning('Prompt content is empty, please edit first')
    return
  }
  emit('generate', {
    prompt: promptText.trim(),
    quad: props.selectedQuad,
    type: selectedPromptType.value,
  })
}
</script>

<template>
  <div class="prompt-management">
    <div v-if="!selectedQuad && promptSequences.length === 0" class="empty-state">
      <p>Please select a path from the Semantic Exploration</p>
    </div>

    <!-- 加载状态 -->
    <div v-else-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <p class="loading-text">Generating prompts...</p>
    </div>

    <div v-else class="prompt-list">
      <!-- 提示词序列 -->
      <div
        v-for="(sequence, seqIndex) in promptSequences"
        :key="sequence.id"
        class="prompt-sequence"
      >
        <!-- 序列标题（下拉框式按钮） -->
        <div class="sequence-header" @click="toggleSequenceExpansion(sequence.id)">
          <div class="sequence-title">
            <span class="sequence-number">Sequence {{ seqIndex + 1 }}</span>
            <span class="sequence-quad"
              >{{ sequence.quad.modifyL }} → {{ sequence.quad.object }} →
              {{ sequence.quad.action }} → {{ sequence.quad.modify }}</span
            >
          </div>
          <div class="sequence-toggle">
            <span v-if="sequence.isExpanded">▼</span>
            <span v-else>▶</span>
          </div>
        </div>

        <!-- 序列内容（展开时显示） -->
        <div v-if="sequence.isExpanded" class="sequence-content">
          <!-- 提示词列表 -->
          <div
            v-for="(prompt, index) in sequence.prompts"
            :key="prompt.id"
            class="prompt-item"
            :class="{
              selected: prompt.isSelected,
              editing: prompt.isEditing,
              'drag-over': dragOverSequenceId === sequence.id && dragOverIndex === index,
              dragging: draggedItem?.sequenceId === sequence.id && draggedItem?.index === index,
            }"
            draggable="true"
            @dragstart="handleDragStart(sequence.id, index, $event)"
            @dragover="handleDragOver(sequence.id, index, $event)"
            @dragleave="handleDragLeave"
            @drop="handleDrop(sequence.id, index, $event)"
          >
            <!-- 拖拽手柄 -->
            <div class="drag-handle">
              <span class="drag-icon">⋮⋮</span>
            </div>

            <!-- 帧编号 -->
            <div class="frame-number">{{ `Frame ${index + 1}` }}</div>

            <!-- 显示模式 -->
            <div
              v-if="!prompt.isEditing"
              class="prompt-text"
              @click="togglePromptSelection(sequence.id, prompt.id)"
              @dblclick="
                () => {
                  prompt.isEditing = true
                  prompt.editText = prompt.text
                }
              "
            >
              <span>{{ prompt.text }}</span>
            </div>

            <!-- 编辑模式 -->
            <div v-else class="prompt-edit">
              <input
                type="text"
                v-model="prompt.editText"
                class="prompt-input"
                @keyup.enter="
                  () => {
                    prompt.text = prompt.editText
                    prompt.isEditing = false
                  }
                "
                @keyup.esc="
                  () => {
                    prompt.isEditing = false
                  }
                "
                @blur="
                  () => {
                    prompt.text = prompt.editText
                    prompt.isEditing = false
                  }
                "
                ref="(el) => el && el.focus()"
              />
            </div>
          </div>

          <!-- 添加关键帧按钮 -->
          <div class="add-keyframe-btn" @click="addKeyframe(sequence.id)">
            <span class="add-icon">+</span>
            <span>Add Keyframe</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 生成按钮 -->
    <div class="generate-section">
      <button class="generate-btn" :disabled="!canGenerate" @click="handleGenerate">
        Generate
      </button>
    </div>
  </div>
</template>

<style scoped>
.prompt-management {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 6px;
  box-sizing: border-box;
}

.prompt-management h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #999;
  text-align: center;
  padding: 20px;
}

/* 加载状态样式 */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #3b82f6;
  text-align: center;
  padding: 20px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e5e7eb;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.prompt-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  margin-bottom: 8px;
  /* 确保整个提示词序列容器有滚动条 */
  min-height: 0;
}

/* 提示词序列样式 */
.prompt-sequence {
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: #f0f0f0;
  /* 确保每个序列卡片的大小不变 */
  min-height: 60px;
  margin-bottom: 6px;
  /* 确保下拉内容不会被裁剪 */
  overflow: visible;
}

/* 自定义滚动条样式 */
.prompt-list::-webkit-scrollbar {
  width: 6px;
}

.prompt-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.prompt-list::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.prompt-list::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 序列标题（下拉框式按钮） */
.sequence-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #e5e7eb;
  border-bottom: 1px solid #d0d0d0;
}

.sequence-header:hover {
  background: #d1d5db;
}

.sequence-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sequence-number {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.sequence-quad {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.4;
}

.sequence-toggle {
  font-size: 10px;
  color: #6b7280;
  transition: transform 0.2s ease;
}

/* 序列内容（展开时显示） */
.sequence-content {
  padding: 6px;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
  max-height: 250px;
  overflow-y: auto;
  position: relative;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}

/* 自定义滚动条样式 */
.sequence-content::-webkit-scrollbar {
  width: 6px;
}

.sequence-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.sequence-content::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.sequence-content::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 提示词项样式 */
.prompt-item {
  background: #f0f0f0;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  padding: 12px;
  padding-top: 24px;
  padding-left: 36px;
  cursor: move;
  transition: all 0.2s ease;
  font-size: 13px;
  line-height: 1.5;
  color: #333;
  position: relative;
  margin-bottom: 6px;
}

.prompt-item:hover {
  border-color: #3b82f6;
  background: #f0f7ff;
}

.prompt-item.selected {
  border-color: #3b82f6;
  background: #dbeafe;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.prompt-item.editing {
  border-color: #3b82f6;
  background: #f0f7ff;
}

/* 拖拽状态样式 */
.prompt-item.dragging {
  opacity: 0.5;
  border: 2px dashed #3b82f6;
}

.prompt-item.drag-over {
  border-top: 3px solid #3b82f6;
  margin-top: 4px;
}

/* 拖拽手柄 */
.drag-handle {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  cursor: move;
  color: #9ca3af;
  user-select: none;
}

.drag-icon {
  font-size: 12px;
  letter-spacing: -2px;
}

.prompt-item:hover .drag-handle {
  color: #6b7280;
}

.prompt-item .prompt-text {
  margin-top: 4px;
}

.prompt-item:last-child {
  margin-bottom: 6px;
}

.prompt-item .frame-number {
  position: absolute;
  top: 4px;
  left: 36px;
  font-size: 10px;
  color: #999;
  background: #e0e0e0;
  padding: 2px 6px;
  border-radius: 10px;
}

.prompt-item {
  padding-top: 24px;
}

.prompt-edit {
  width: 100%;
}

.prompt-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: #333;
  background: white;
  outline: none;
  box-sizing: border-box;
}

.prompt-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

/* 添加关键帧按钮 */
.add-keyframe-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #f8f9fa;
  border: 1px dashed #d0d0d0;
  border-radius: 6px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 12px;
  color: #6b7280;
  margin-top: 6px;
}

.add-keyframe-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
  background: #f0f7ff;
}

.add-keyframe-btn .add-icon {
  font-size: 16px;
  font-weight: bold;
}

.generate-section {
  margin-top: auto;
  padding: 6px 0;
  box-sizing: border-box;
  min-height: 60px;
  overflow: visible;
  display: flex;
  justify-content: center;
  align-items: center;
}

.generate-btn {
  width: 520px;
  padding: 10px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;
  box-sizing: border-box;
}

.generate-btn:hover:not(:disabled) {
  background: #2563eb;
}

.generate-btn:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
</style>
