<template>
  <div class="traj-editor">
    <canvas
      ref="canvas"
      :width="width"
      :height="height"
      class="traj-canvas"
      @click="onCanvasClick"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  addDrag,
  deleteLastDrag,
  deleteLastStep,
  resetTracks,
  addPoint,
  type Tracks,
} from '../utils/trajectory'

interface Props {
  value?: Tracks
  imgUrl?: string
  width?: number
  height?: number
  showToolbar?: boolean
  interactive?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  value: () => [],
  imgUrl: '',
  width: 300,
  height: 300,
  showToolbar: false,
  interactive: true,
})

const emit = defineEmits<{
  (e: 'input', value: Tracks): void
  (e: 'update:value', value: Tracks): void
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)
const baseImg = ref<HTMLImageElement | null>(null)

const tracks = computed<Tracks>(() => props.value || [])
const hasTracks = computed(() => tracks.value.length > 0)
const canUndoTrack = computed(() => tracks.value.length > 0)
const canUndoStep = computed(() => {
  const last = tracks.value[tracks.value.length - 1]
  return !!last && last.length > 0
})

const emitValue = (next: Tracks) => {
  emit('input', next)
  emit('update:value', next)
}

const addDragTrajectory = () => {
  const next = addDrag(tracks.value)
  emitValue(next)
}

const handleDeleteLastDrag = () => {
  const next = deleteLastDrag(tracks.value)
  emitValue(next)
}

const handleDeleteLastStep = () => {
  const next = deleteLastStep(tracks.value)
  emitValue(next)
}

const reset = () => {
  const next = resetTracks()
  emitValue(next)
}

// 交互：点击画点
const onCanvasClick = (evt: MouseEvent) => {
  if (!props.interactive) return
  const [x, y] = eventToCanvasXY(evt)
  const next = addPoint(tracks.value, x, y)
  emitValue(next)
}

// 内部绘制
const loadBase = (url: string) => {
  if (!url) {
    baseImg.value = null
    redraw()
    return
  }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    baseImg.value = img
    redraw()
  }
  img.src = url
}

const eventToCanvasXY = (evt: MouseEvent): [number, number] => {
  if (!canvas.value) return [0, 0]
  const rect = canvas.value.getBoundingClientRect()
  const x = (evt.clientX - rect.left) * (props.width / rect.width)
  const y = (evt.clientY - rect.top) * (props.height / rect.height)
  return [Math.round(x), Math.round(y)]
}

const redraw = () => {
  if (!ctx.value) return
  const context = ctx.value
  context.clearRect(0, 0, props.width, props.height)

  if (baseImg.value) {
    context.drawImage(baseImg.value, 0, 0, props.width, props.height)
  }

  const COLORS = ['#ff0000', '#11aa55', '#2255ff', '#ffaa00', '#cc00cc', '#00cccc']
  context.lineWidth = 2
  context.lineCap = 'round'

  const drawArrow = (x1: number, y1: number, x2: number, y2: number, color: string) => {
    context.strokeStyle = color
    context.fillStyle = color
    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.stroke()

    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.max(Math.hypot(dx, dy), 1e-6)
    const ux = dx / len
    const uy = dy / len
    const size = Math.min(12, 8 / (len / 20 + 1)) + 6
    const leftX = x2 - ux * size + -uy * (size * 0.6)
    const leftY = y2 - uy * size + ux * (size * 0.6)
    const rightX = x2 - ux * size + uy * (size * 0.6)
    const rightY = y2 - uy * size + -ux * (size * 0.6)
    context.beginPath()
    context.moveTo(x2, y2)
    context.lineTo(leftX, leftY)
    context.lineTo(rightX, rightY)
    context.closePath()
    context.fill()
  }

  tracks.value.forEach((track, idx) => {
    const color = COLORS[idx % COLORS.length]
    if (!track || track.length === 0) return
    if (track.length === 1) {
      const [x, y] = track[0]
      context.fillStyle = color
      context.beginPath()
      context.arc(x, y, 5, 0, Math.PI * 2)
      context.fill()
    } else {
      for (let i = 0; i < track.length - 1; i++) {
        const [x1, y1] = track[i]
        const [x2, y2] = track[i + 1]
        if (i === track.length - 2) {
          drawArrow(x1, y1, x2, y2, color)
        } else {
          context.strokeStyle = color
          context.beginPath()
          context.moveTo(x1, y1)
          context.lineTo(x2, y2)
          context.stroke()
        }
      }
    }
  })
}

// 监听属性变化
watch(
  () => props.imgUrl,
  (val) => {
    loadBase(val)
  },
  { immediate: true },
)

watch(
  tracks,
  () => {
    redraw()
  },
  { deep: true },
)

// 组件挂载时初始化
onMounted(() => {
  if (canvas.value) {
    ctx.value = canvas.value.getContext('2d')
    redraw()
  }
})

// 暴露方法给父组件
defineExpose({
  addDragTrajectory,
  deleteLastDrag: handleDeleteLastDrag,
  deleteLastStep: handleDeleteLastStep,
  reset,
  hasTracks,
  canUndoTrack,
  canUndoStep,
})
</script>

<style scoped>
.traj-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.traj-canvas {
  display: block;
  width: 100%;
  max-width: 269px;
  height: auto;
  border: 1px bold #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  cursor: crosshair;
}

.traj-canvas:hover {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.toolbar {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

button {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
