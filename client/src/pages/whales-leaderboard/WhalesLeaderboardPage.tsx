import TextPressure from "../../components/TextPressure"

const WhalesLeaderboardPage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="max-w-[600px] w-full text-center">
        <TextPressure
          text="Coming Soon"
          flex={true}
          alpha={false}
          stroke={false}
          width={true}
          weight={true}
          italic={true}
          textColor="#ffffff"
          strokeColor="#ff0000"
          minFontSize={24}
        />
      </div>
    </div>
  )
}

export default WhalesLeaderboardPage
