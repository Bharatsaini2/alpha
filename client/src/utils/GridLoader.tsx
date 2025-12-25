import React from "react";

const GridLoader: React.FC = () => {
    return (
        <div className="absolute inset-0 flex justify-center items-center z-20">
            <div className="lds-spinner text-white">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i}></div>
                ))}
            </div>
        </div>
    );
};

export default GridLoader;
