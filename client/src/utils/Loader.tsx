import React from "react";

const Loader: React.FC = () => {
    return (
        <div className="fixed inset-0 flex justify-center items-center bg-black/50 backdrop-blur-md z-50">
            {/* Spinning Loader */}
            <div className="lds-spinner text-white">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i}></div>
                ))}
            </div>
        </div>
    );
};

export default Loader;