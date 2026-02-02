import WhaleNetworkGraph from "./WhaleNetworkGraph"
import KolNetworkGraph from "./KolNetworkGraph"

interface WhaleFilterModalProps {
  isOpen: boolean
  onClose: () => void
  type?: 'whale' | 'kol'
}

export default function WhaleFilterModal({
  isOpen,
  onClose,
  type = 'whale'
}: WhaleFilterModalProps) {
  return type === 'kol' ? (
    <KolNetworkGraph isOpen={isOpen} onClose={onClose} />
  ) : (
    <WhaleNetworkGraph isOpen={isOpen} onClose={onClose} />
  )
}
