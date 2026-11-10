// glTF 모델 하나의 실패 처리(#327). 스페이 · 라코 GLB를 못 받으면 그 모델만 빠지고 나머지 장면(정거장 · 상자 · 회의실)은
// 그대로 둔다 — 감싸지 않으면 오류가 3D 전체(SceneBoundary)까지 올라가 정거장이 통째로 꺼진다.
// drei useGLTF는 실패한 결과를 캐시에 남겨 같은 오류를 다시 내므로, 다시 불러오기 전에 캐시를 비운다.
// 다시 불러오기: 네트워크가 돌아오면(online) 바로, 그 밖에는 RETRY_DELAYS_MS 간격으로 몇 번만. 소유: C.
import { useGLTF } from '@react-three/drei'
import { Component, Suspense, type ReactNode } from 'react'

/** 실패한 뒤 다시 불러오기까지 기다리는 시간 — 다 쓰면 online 이벤트만 기다린다(없는 파일을 계속 부르지 않게) */
const RETRY_DELAYS_MS = [5_000, 20_000, 60_000] as const

interface Props {
  /** 감싼 장면이 불러오는 glTF 주소 — 실패하면 이 주소의 캐시를 비운다 */
  url: string
  children: ReactNode
}

interface State {
  failed: boolean
  /** 다시 불러온 횟수 — 자식을 새로 마운트하는 key */
  attempt: number
}

export class ModelBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 }
  private timer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn(`3D 모델을 불러오지 못해 빼고 그려요: ${this.props.url}`, error)
    useGLTF.clear(this.props.url)
    const delay = RETRY_DELAYS_MS[this.state.attempt]
    if (delay !== undefined) this.timer = setTimeout(this.retry, delay)
  }

  componentDidMount() {
    window.addEventListener('online', this.onOnline)
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.onOnline)
    if (this.timer) clearTimeout(this.timer)
  }

  private onOnline = () => {
    if (this.state.failed) this.retry()
  }

  private retry = () => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))
  }

  render() {
    if (this.state.failed) return null
    return (
      <Suspense key={this.state.attempt} fallback={null}>
        {this.props.children}
      </Suspense>
    )
  }
}
