import { GoogleLoginButton, ORCIDLoginButton } from './login-buttons.js'
import {
    useParams,
    useNavigate,
    Navigate
  } from 'react-router-dom';
import React, { useEffect, useRef, useState } from 'react'
import contractAddresses from '../contractAddresses.json'
import { fixedBufferXOR as xor, sandwichIDWithBreadFromContract, padBase64, hexToString, searchForPlainTextInBase64 } from 'wtfprotocol-helpers'
import abi from '../abi/VerifyJWT.json'
import { LitCeramic } from './lit-ceramic.js'
const { ethers } = require('ethers')

// takes encoded JWT and returns parsed header, parsed payload, parsed signature, raw header, raw header, raw signature
const parseJWT = (JWT) => {
    if(!JWT){return null}
    let parsedToJSON = {}
    JWT.split('&').map(x=>{let [key, value] = x.split('='); parsedToJSON[key] = value});
    let [rawHead, rawPay, rawSig] = parsedToJSON['id_token'].split('.');
    let [head, pay] = [rawHead, rawPay].map(x => JSON.parse(atob(x)));
    let [sig] = [Buffer.from(rawSig.replaceAll('-', '+').replaceAll('_', '/'), 'base64')] //replaceAlls convert it from base64url to base64
    return {
      'header' :  {
        'parsed' : head,
       'raw' : rawHead,
      }, 
      'payload' :  {
        'parsed' : pay,
       'raw' : rawPay,
      }, 
      'signature' :  {
        'decoded' : sig,
       'raw' : rawSig,
      }, 
    }
  }
  
  const ignoredFields = ['azp', 'kid', 'alg', 'at_hash', 'aud', 'auth_time', 'iss', 'exp', 'iat', 'jti', 'nonce'] //these fields should still be checked but just not presented to the users as they are unecessary for the user's data privacy and confusing for the user
  // React component to display (part of) a JWT in the form of a javscript Object to the user
  const DisplayJWTSection = (props) => {
    return <>
    {Object.keys(props.section).map(x => {
      console.log(x)
      if(ignoredFields.includes(x)){
        return null
      } else {
        let field = x;
        // give a human readable name to important field:
        if(field == 'sub'){field='subject (ID)'}
        // capitalize first letter:
        field = field.replace('_', ' ')
        field = field[0].toUpperCase() + field.substring(1)
  
        return <p class='token-field'>{field + ': ' + props.section[x]}</p>
      }
    })}
    </>
  }

let pendingProofPopup = false; 

const AuthenticationFlow = (props) => {
    const params = useParams();
    const navigate = useNavigate();
    let token = params.token || props.token // Due to redirects with weird urls from some OpenID providers, there can't be a uniform way of accessing the token from the URL, so props based on window.location are used in weird situations
    const vjwt = props.web2service ? new ethers.Contract(contractAddresses[props.web2service], abi, props.provider.getSigner()) : null;
    const [step, setStep] = useState(null);
    const [JWTText, setJWTText] = useState('');
    const [JWTObject, setJWTObject] = useState(''); //a fancy version of the JWT we will use for this script
    const [displayMessage, setDisplayMessage] = useState('');
    const [onChainCreds, setOnChainCreds] = useState(null);
    const [txHash, setTxHash] = useState(null);
    const [credentialsRPrivate, setCredentialsRPrivate] = useState(false);
    let revealBlock = 0; //block when user should be prompted to reveal their JWT
    // useEffect(()=>{if(token){setJWTText(token); setStep('userApproveJWT')}}, []) //if a token is provided via props, set the JWTText as the token and advance the form past step 1
    
    // if a token is already provided, set the step to user approving the token
    if(token){
      if(JWTText == ''){
        console.log('setting token')
        setJWTText(token); setStep('userApproveJWT')
      }
    } else {
      if(step){
        setStep(null)
      }
    }
    console.log(props, JWTText, step)
  
    useEffect(()=>setJWTObject(parseJWT(JWTText)), [JWTText]);
  
  
    if(!props.provider){console.log(props); return 'Please connect your wallet'}
  
  
    const commitJWTOnChain = async (JWTObject) => {
      console.log('commitJWTOnChat called')
      let message = JWTObject.header.raw + '.' + JWTObject.payload.raw
      // let publicHashedMessage = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(message))
      let secretHashedMessage = ethers.utils.sha256(ethers.utils.toUtf8Bytes(message))
      setDisplayMessage('It may take some time for a block to be mined. You will be prompted a second time in about 10 seconds, once the transaction is confirmed. Depending on your chain\'s finality and confirmation times, you may want to wait even longer.')
      console.log(secretHashedMessage, props.account)
      // xor the values as bytes (without preceding 0x)
      let proofPt1 = xor(Buffer.from(secretHashedMessage.replace('0x',''), 'hex'), Buffer.from(props.account.replace('0x',''), 'hex'));
      let proof = ethers.utils.sha256(proofPt1)
      console.log(proof.toString('hex'))
      let tx = await vjwt.commitJWTProof(proof)
      revealBlock = await props.provider.getBlockNumber() + 1
      console.log('t', await props.provider.getBlockNumber() + 1, revealBlock)
      let revealed = false 
      props.provider.on('block', async () => {
        console.log(revealed, 'revealed')
        console.log(await props.provider.getBlockNumber(), revealBlock)
        if(( await props.provider.getBlockNumber() >= revealBlock) && (!revealed)){
          setStep('waitingForBlockCompletion')
          revealed=true
        }
      })
      // setStep('waitingForBlockCompletion')
    }
  
    // credentialField is 'email' for gmail and 'sub' for orcid. It's the claim of the JWT which should be used as an index to look the user up by
    const proveIKnewValidJWT = async (credentialClaim) => {
      let sig = JWTObject.signature.decoded
      let message = JWTObject.header.raw + '.' + JWTObject.payload.raw
      let payloadIdx = Buffer.from(JWTObject.header.raw).length + 1
      console.log(JWTObject.payload.parsed[credentialClaim])
      let sandwich = await sandwichIDWithBreadFromContract(JWTObject.payload.parsed[credentialClaim], vjwt);
      console.log(sandwich, JWTObject.payload.raw)
      let [startIdx, endIdx] = searchForPlainTextInBase64(Buffer.from(sandwich, 'hex').toString(), JWTObject.payload.raw)
  
      console.log(vjwt, ethers.BigNumber.from(sig), message, payloadIdx, startIdx, endIdx, sandwich)
      console.log(vjwt.address)
      let tx = await vjwt.verifyMe(ethers.BigNumber.from(sig), message, payloadIdx, startIdx, endIdx, '0x'+sandwich);
      
      setTxHash(tx.hash)
      return tx
  
    }
  
    // vjwt is VerifyJWT smart contract as an ethers object, JWTObject is the parsed JWT
    const submitAnonymousCredentials = async (vjwt, JWTObject) => {
      let message = JWTObject.header.raw + '.' + JWTObject.payload.raw
      let sig = JWTObject.signature.decoded
      let tx = await vjwt.linkPrivateJWT(ethers.BigNumber.from(sig), ethers.utils.sha256(ethers.utils.toUtf8Bytes(message)))
      setTxHash(tx.hash)
      return tx
    }
  
    // listen for the transaction to go to the mempool
    // props.provider.on('pending', async () => console.log('tx'))
  
  
    switch(step){
      case 'waitingForBlockCompletion':
        if(!pendingProofPopup){
          pendingProofPopup = true;
          // this should be multiple functions eventually instead of convoluded nested loops
          if(credentialsRPrivate){
            submitAnonymousCredentials(vjwt, JWTObject).then(tx => {
              props.provider.once(tx, async () => {    
                console.log('WE SHOULD NOTIFY THE USER WHEN THIS FAILS')        
                // setStep('success'); 
              })
            })
          } else {
            proveIKnewValidJWT(props.credentialClaim).then(tx => {
              props.provider.once(tx, async () => {
                console.log(props.account)
                console.log(await vjwt.credsForAddress(props.account))
                console.log(hexToString(await vjwt.credsForAddress(props.account)))
                await setOnChainCreds(
                  hexToString(await vjwt.credsForAddress(props.account))
                );
          
                setStep('success'); })
            })
          }
        }
        return credentialsRPrivate ? <LitCeramic provider={props.provider} stringToEncrypt={JWTObject.header.raw + '.' + JWTObject.payload.raw}/> : <p>Waiting for block to be mined</p>
      case 'success':
        console.log(onChainCreds);
        console.log(`https://whoisthis.wtf/lookup/${props.web2service}/${onChainCreds}`)
        return onChainCreds ? 
        <>
          <p class='success'>✓ You're successfully verified as {onChainCreds} :)</p>
          <br />
          <a href={'https://testnet.snowtrace.io/tx/' + txHash}>transaction hash</a>
          <a href={`https://whoisthis.wtf/lookup/${props.web2service}/${onChainCreds}`}>look me up</a>
        </> : <p class='warning'>Failed to verify JWT on-chain</p>
  
      case 'userApproveJWT':
        if(!JWTObject){return 'waiting for token to load'}
        return displayMessage ? displayMessage : <p>
                <h1>If you're OK with this info being on-chain</h1>
                {/*Date.now() / 1000 > JWTObject.payload.parsed.exp ? 
                  <p class='success'>JWT is expired ✓ (that's a good thing)</p> 
                  : 
                  <p class='warning'>WARNING: Token is not expired. Submitting it on chain is dangerous</p>}*/}
                {/*Header
                <br />
                <code>
                  <DisplayJWTSection section={JWTObject.header.parsed} />
                </code>
                */}
                <code><DisplayJWTSection section={JWTObject.payload.parsed} /></code>
                {
                  
                  props.account ? <>
                  Then<br />
                  <button class='cool-button' onClick={async ()=>{await commitJWTOnChain(JWTObject)}}>Submit Public Holo</button>
                  <br />Otherwise<br />
                  <button class='cool-button' onClick={async ()=>{await commitJWTOnChain(JWTObject); setCredentialsRPrivate(true)}}>Submit Private Holo</button>
                  </>
                   : 
                  <button class='cool-button' onClick={props.connectWalletFunction}>Connect Wallet to Finish Verifying Yourself</button>}
              </p>
      default:
        return <div className='x-section wf-section'>
                  <h2>Login with a Web2 account to link it to your blockchain address</h2>
                  <div class='message'>{displayMessage}</div>
                  <GoogleLoginButton
                      onSuccess={r=>navigate(`/google/token/id_token=${r.tokenId}`)}
                    />
                  {/*
                  <FacebookLogin
                      appId="1420829754999380"
                      autoLoad={false}
                      fields="name,email,picture"
                      // onClick={componentClicked}
                  callback={responseFacebook} />*/}
                  <ORCIDLoginButton />
                </div>
  
              
    }
    
  }

  export default AuthenticationFlow;