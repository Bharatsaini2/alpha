import { PiPlugs, PiTelegramLogoDuotone } from "react-icons/pi"

function ProfilePage() {
  return (
    <>
    <section>
        <div className="row justify-center">
              <div className="col-lg-5">
                        <div className="alpha-profile-card mb-3">
                            <div className="alpha-profile-title-bx nw-kol-profile">
                                <div>
                                    <h6>Profile</h6>
                                </div>

                                <div>
                                    <button className="alpha-edit-btn">EDIT PRofile</button>
                                </div>
                            </div>

                            <div className="alpha-profile-content nw-kol-profile">
                                <div className="alpha-profile-user-bx ">
                                    <div className="alpha-user-details">
                                        <img src="/profile-usr.png" alt="" />
                                        <div>
                                            <h4>Blissful Design</h4>
                                            <div className="nw-user-info-bx">
                                                <div>
                                                    <h6>email</h6>
                                                    <p>eng@blissful.design</p>
                                                </div>
                                                <div>
                                                    <h6>Join date</h6>
                                                    <p>12 Nov, 2025</p>
                                                </div>
                                            </div>

                                        </div>

                                    </div>

                                </div>
                            </div>

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
                                <div className="share-profile shre-profile-tilte">
                                    <img src="/profile-usr.png" alt="" />

                                    <div>
                                        <h4>BLissful design</h4>

                                        <button className="telegram-share-btn">
                                            <PiTelegramLogoDuotone />

                                            @blissful
                                        </button>


                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
        </div>
    </section>
    </>
  )
}

export default ProfilePage