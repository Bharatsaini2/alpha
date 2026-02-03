import KolNetworkGraph from "./KolNetworkGraph"

export default function KolFilterModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  return <KolNetworkGraph isOpen={isOpen} onClose={onClose} />
}
