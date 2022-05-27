import React from "react";
import CircleWavy from "../../img/CircleWavy.svg";
import CircleWavyCheck from "../../img/CircleWavyCheck.svg";
import Github from "../../img/Github.svg";
import Google from "../../img/Google.svg";
import Orcid from "../../img/Orcid.svg";
import TwitterLogo from "../../img/TwitterLogo.svg";
import profile from "../../img/profile.svg";
import { linkFor } from "../../utils/link-for.js";
import { useNavigate } from "react-router-dom";

const icons = {
  google: Google,
  github: Github,
  orcid: Orcid,
  twitter: TwitterLogo,
};
// const defaultHolo = {
//   address: "",
//   name: "Anonymous",
//   bio: "No information provided",
//   twitter: "",
//   google: "",
//   github: "",
//   orcid: "",
// };

const Holo = (props) => {
  const navigate = useNavigate();
  return (
      <div className="x-card" onClick={()=>navigate('/lookup/address/' + props.holo.address)}>
        <div className="id-card profile">
          <div className="id-card-1">
            <img src={profile} loading="lazy" alt="" className="id-img" />
          </div>
          <div className="id-card-2">
            <div className="id-profile-name-div">
              <h3 id="w-node-_0efb49bf-473f-0fcd-ca4f-da5c9faeac9a-4077819e" className="h3 no-margin">
                {props.holo.name}
              </h3>
            </div>
            <div className="spacer-xx-small"></div>
            <p className="id-designation">{props.holo.bio}</p>
          </div>
        </div>
        <div className="spacer-small"></div>
        {/* <div className="card-heading">
        <h3 className="h3 no-margin">Profile Strength</h3>
        <div className="v-spacer-small"></div>
        <h3 className="h3 no-margin active">Pro</h3>
        <InfoButton text='Profile Strength is stronger the more accounts you have, the more recently you link the accounts, and greater your social activity metrics (e.g., number of friends, followers, repositories, etc.)' />
      </div> */}
        <div className="spacer-small"></div>
        {Object.keys(props.holo)
          .filter((k) => !["name", "bio", "address", "discord"].includes(k)) //ignore discord too for now
          .map((k, index) => (
            <div key={index}>
              <a style={{ textDecoration: "none" }} href={linkFor(k, props.holo[k])}>
                <div className="card-text-div">
                  <img src={icons[k]} loading="lazy" alt="" className="card-logo" />
                  <div className="card-text">{props.holo[k] || "Not listed"}</div>
                  <img src={props.holo[k] ? CircleWavyCheck : CircleWavy} loading="lazy" alt="" className="id-verification-icon" />
                </div>
              </a>
              <div className="spacer-x-small"></div>
            </div>
          ))}
      </div>
  );
};

export default Holo;
