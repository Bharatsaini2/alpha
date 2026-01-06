import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { PiPlugs, PiTelegramLogoDuotone } from "react-icons/pi";
import { RiVerifiedBadgeFill } from "react-icons/ri";

function TelegramSubscription() {

    const [openId, setOpenId] = useState(null);

    const toggleAccordion = (id) => {
        setOpenId(openId === id ? null : id);
    };



    return (
        <>
            <section className="">

                <div className="row justify-content-center">
                    <div className="col-lg-4 col-md-12 col-sm-12">
                        <div className="">
                            <a href="javascript:void(0)" className="back-link mb-2"> <FontAwesomeIcon icon={faArrowLeft}/> Back</a>
                        </div>

                        <div className="alpha-profile-card mb-3">
                            <div className="alpha-profile-title-bx nw-kol-profile">
                                <div>
                                    <h6>Connected telegram account</h6>
                                </div>

                                <div>
                                    <button className="dis-connect-btn">disconnect <span className="text-white fz-14"><PiPlugs /></span></button>
                                </div>
                            </div>

                            <div className="alpha-profile-content nw-kol-profile">
                                <div className="share-profile">
                                    <img src="/profile-usr.png" alt="" />

                                    <div>
                                        <h4>BLissful design</h4>

                                        <button className="telegram-share-btn mt-2">
                                            <PiTelegramLogoDuotone />

                                            @gamerx
                                        </button>


                                    </div>
                                </div>
                            </div>

                        </div>

                        <div className="subscription-all-number mb-2">
                            <div>
                                <h6>List of Subscription Alerts</h6>
                            </div>
                            <div>
                                <h6>[ 8 ]</h6>
                            </div>
                        </div>

                        <div className="subscripton-bx">
                            <div className="accordion">

                                {/* ITEM 1 */}
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button
                                            type="button"
                                            onClick={() => toggleAccordion("crypto1")}
                                            className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === "crypto1" ? "" : "collapsed"
                                                }`}
                                        >
                                            <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                <div className="share-profile">
                                                    <img src="/profile-usr.png" alt="" />
                                                    <div>
                                                        <h4>
                                                            BLissful design <RiVerifiedBadgeFill />
                                                        </h4>
                                                        <button className="telegram-share-btn mt-2">
                                                            <PiTelegramLogoDuotone /> @blissful
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        </button>
                                    </h2>

                                    {openId === "crypto1" && (
                                        <div className="accordion-collapse show">
                                            <div className="accordion-body text-secondary">
                                                Extra details / description yahan aayegi.
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ITEM 2 */}
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button
                                            type="button"
                                            onClick={() => toggleAccordion("crypto2")}
                                            className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === "crypto2" ? "" : "collapsed"
                                                }`}
                                        >
                                            <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                <div className="share-profile">
                                                    <img src="/profile-usr.png" alt="" />
                                                    <div>
                                                        <h4>
                                                            BLissful design <RiVerifiedBadgeFill />
                                                        </h4>
                                                        <button className="telegram-share-btn mt-2">
                                                            <PiTelegramLogoDuotone /> @crypt
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        </button>
                                    </h2>

                                    {openId === "crypto2" && (
                                        <div className="accordion-collapse show">
                                            <div className="accordion-body text-secondary">
                                                Extra details / description yahan aayegi.
                                            </div>
                                        </div>
                                    )}
                                </div>


                                {/* ITEM 3 */}
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button
                                            type="button"
                                            onClick={() => toggleAccordion("crypto3")}
                                            className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === "crypto3" ? "" : "collapsed"
                                                }`}
                                        >
                                            <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                <div className="share-profile">
                                                    <img src="/profile-usr.png" alt="" />
                                                    <div>
                                                        <h4>
                                                            BLissful design <RiVerifiedBadgeFill />
                                                        </h4>
                                                        <button className="telegram-share-btn mt-2">
                                                            <PiTelegramLogoDuotone /> @crypt
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        </button>
                                    </h2>

                                    {openId === "crypto3" && (
                                        <div className="accordion-collapse show">
                                            <div className="accordion-body text-secondary">
                                                Extra details / description yahan aayegi.
                                            </div>
                                        </div>
                                    )}
                                </div>


                                {/* ITEM 4 */}
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button
                                            type="button"
                                            onClick={() => toggleAccordion("crypto4")}
                                            className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === "crypto4" ? "" : "collapsed"
                                                }`}
                                        >
                                            <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                <div className="share-profile">
                                                    <img src="/profile-usr.png" alt="" />
                                                    <div>
                                                        <h4>
                                                            BLissful design <RiVerifiedBadgeFill />
                                                        </h4>
                                                        <button className="telegram-share-btn mt-2">
                                                            <PiTelegramLogoDuotone /> @crypt
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        </button>
                                    </h2>

                                    {openId === "crypto4" && (
                                        <div className="accordion-collapse show">
                                            <div className="accordion-body text-secondary">
                                                Extra details / description yahan aayegi.
                                            </div>
                                        </div>
                                    )}
                                </div>


                                {/* ITEM 5 */}
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button
                                            type="button"
                                            onClick={() => toggleAccordion("crypto5")}
                                            className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === "crypto5" ? "" : "collapsed"
                                                }`}
                                        >
                                            <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                <div className="share-profile">
                                                    <img src="/profile-usr.png" alt="" />
                                                    <div>
                                                        <h4>
                                                            BLissful design <RiVerifiedBadgeFill />
                                                        </h4>
                                                        <button className="telegram-share-btn mt-2">
                                                            <PiTelegramLogoDuotone /> @crypt
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        </button>
                                    </h2>

                                    {openId === "crypto5" && (
                                        <div className="accordion-collapse show">
                                            <div className="accordion-body text-secondary">
                                                Extra details / description yahan aayegi.
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        </div>



                    </div>



                </div>
            </section>
        </>
    )
}

export default TelegramSubscription