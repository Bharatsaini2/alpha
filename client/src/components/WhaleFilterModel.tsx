import WhaleNetworkGraph from "./WhaleNetworkGraph"

export default function WhaleFilterModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  return <WhaleNetworkGraph isOpen={isOpen} onClose={onClose} />
}
