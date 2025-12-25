import { ArrowLeft, Home, AlertCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"


const NotFound = () => {
    const navigate = useNavigate()

    return (
      <div className="min-h-screen bg-[#000] text-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          {/* Icon */}
          <div className="mb-8">
            <AlertCircle className="h-20 w-20 text-[#767678] mx-auto mb-4 animate-bounce" />
          </div>
  
          {/* 404 Text */}
          <h1 className="text-6xl font-bold text-[#767678] font-orbitron mb-4 animate-bounce">404</h1>
  
          {/* Message */}
          <h2 className="text-2xl font-semibold text-white mb-4 font-orbitron">Page Not Found</h2>
          <p className="text-gray-400 mb-8">
            The page you're looking for doesn't exist or has been moved to another location.
          </p>
  
          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate("/")}
              className="bg-[#767678] text-white hover:bg-[#767678]/90 transition-colors flex items-center justify-center p-3 rounded-lg cursor-pointer"
            >
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </button>
            <button
              onClick={() => navigate(-1)}
              className="border-[#5f5d5d] text-white hover:bg-[#141414] transition-colors flex items-center justify-center p-3 rounded-lg cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
};

export default NotFound