import React from 'react';
import Svg, { Path, G, Mask, Defs, LinearGradient, Stop, Filter, FeFlood, FeBlend, FeGaussianBlur, ClipPath, Rect } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';

interface ActivityIconProps {
  size?: number;
}

export default function ActivityIcon({ size = 20 }: ActivityIconProps) {
  const { isDark } = useTheme();
  
  if (isDark) {
    // Dark mode SVG (activity.svg)
    return (
      <Svg width={size} height={size} viewBox="0 0 67 67" fill="none">
        <Defs>
          <ClipPath id="clip0_120_18499">
            <Rect width="66.7095" height="66.7095" fill="white" />
          </ClipPath>
          <Filter id="filter0_f_120_18499" x="-9.7872" y="-9.29404" width="76.4963" height="66.5913" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <FeFlood floodOpacity="0" result="BackgroundImageFix" />
            <FeBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
            <FeGaussianBlur stdDeviation="5.55913" result="effect1_foregroundBlur_120_18499" />
          </Filter>
          <LinearGradient id="paint0_linear_120_18499" x1="28.4615" y1="1.8198" x2="28.4615" y2="46.1761" gradientUnits="userSpaceOnUse">
            <Stop stopColor="#575757" />
            <Stop offset="1" stopColor="#151515" />
          </LinearGradient>
          <LinearGradient id="paint1_linear_120_18499" x1="28.4596" y1="1.82346" x2="28.4596" y2="46.1797" gradientUnits="userSpaceOnUse">
            <Stop stopColor="#575757" />
            <Stop offset="1" stopColor="#151515" />
          </LinearGradient>
          <LinearGradient id="paint2_linear_120_18499" x1="68.0982" y1="43.0855" x2="11.1172" y2="43.0855" gradientUnits="userSpaceOnUse">
            <Stop stopColor="#E3E3E5" stopOpacity="0.6" />
            <Stop offset="1" stopColor="#BBBBC0" stopOpacity="0.6" />
          </LinearGradient>
          <LinearGradient id="paint3_linear_120_18499" x1="38.2485" y1="20.9074" x2="38.2485" y2="46.5933" gradientUnits="userSpaceOnUse">
            <Stop stopColor="white" />
            <Stop offset="1" stopColor="white" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <G opacity="0.3" clipPath="url(#clip0_120_18499)">
          <Mask id="mask0_120_18499" maskUnits="userSpaceOnUse" x="0" y="0" width="67" height="67">
            <Path d="M66.7095 0.00146484H0V66.711H66.7095V0.00146484Z" fill="white" />
            <Path d="M33.3537 61.0865V52.8145H15.2865C12.9839 52.8145 11.1172 50.9477 11.1172 48.6451L11.1172 37.5269C11.1172 35.2243 12.9839 33.3575 15.2866 33.3575H33.3537V25.0857C33.3537 21.6377 37.3007 19.6799 40.0458 21.7662L63.7304 39.7667C65.926 41.4349 65.926 44.7371 63.7304 46.4054L40.0458 64.4058C37.3007 66.4922 33.3537 64.5342 33.3537 61.0865Z" fill="black" />
          </Mask>
          <G mask="url(#mask0_120_18499)">
            <Path d="M33.3564 41.9981V33.7264H51.4235C53.7261 33.7264 55.5929 31.8597 55.5929 29.5571V18.4387C55.5929 16.1361 53.7261 14.2694 51.4235 14.2694H33.3564V5.99754C33.3564 2.54955 29.4094 0.59174 26.6642 2.67805L2.97955 20.6784C0.784159 22.3469 0.784159 25.6489 2.97955 27.3174L26.6642 45.3177C29.4094 47.4041 33.3564 45.4462 33.3564 41.9981Z" fill="url(#paint0_linear_120_18499)" />
          </G>
          <Mask id="mask1_120_18499" maskUnits="userSpaceOnUse" x="11" y="20" width="55" height="46">
            <Path d="M33.3537 61.0845V52.8125H15.2865C12.9839 52.8125 11.1172 50.9458 11.1172 48.6432L11.1172 37.5249C11.1172 35.2223 12.9839 33.3556 15.2866 33.3556H33.3537V25.0837C33.3537 21.6357 37.3007 19.6779 40.0458 21.7642L63.7304 39.7647C65.926 41.433 65.926 44.7351 63.7304 46.4034L40.0458 64.4039C37.3007 66.4902 33.3537 64.5323 33.3537 61.0845Z" fill="white" />
          </Mask>
          <G mask="url(#mask1_120_18499)">
            <G filter="url(#filter0_f_120_18499)">
              <Path d="M33.3544 42.0018V33.7301H51.4216C53.7242 33.7301 55.5909 31.8633 55.5909 29.5607V18.4424C55.5909 16.1397 53.7242 14.2731 51.4216 14.2731H33.3544V6.0012C33.3544 2.55321 29.4074 0.595402 26.6623 2.68172L2.9776 20.6821C0.782206 22.3506 0.782206 25.6525 2.9776 27.321L26.6623 45.3214C29.4074 47.4078 33.3544 45.4498 33.3544 42.0018Z" fill="url(#paint1_linear_120_18499)" />
            </G>
          </G>
          <Path d="M33.3537 61.086V52.814H15.2865C12.9839 52.814 11.1172 50.9472 11.1172 48.6446L11.1172 37.5264C11.1172 35.2238 12.9839 33.357 15.2866 33.357H33.3537V25.0852C33.3537 21.6372 37.3007 19.6794 40.0458 21.7657L63.7304 39.7662C65.926 41.4345 65.926 44.7366 63.7304 46.4049L40.0458 64.4053C37.3007 66.4917 33.3537 64.5337 33.3537 61.086Z" fill="url(#paint2_linear_120_18499)" />
          <Path d="M11.1172 48.6435V37.5253C11.1175 35.2227 12.9841 33.3559 15.2865 33.3559H33.3537V25.085C33.3537 21.6373 37.2996 19.6797 40.0447 21.7653L63.7307 39.7645C65.926 41.4331 65.9257 44.7355 63.7307 46.404L40.0447 64.4034C37.3855 66.4244 33.5986 64.6516 33.3645 61.4039L33.3537 61.0862V52.8129H15.2865V50.7282H35.4384V61.0862C35.4392 62.8096 37.413 63.7877 38.7852 62.7448L62.4685 44.7455C63.5662 43.9113 63.5662 42.26 62.4685 41.4258L38.7852 23.4238C37.4127 22.3806 35.4384 23.3611 35.4384 25.085V35.4406H15.2865C14.1354 35.4406 13.2021 36.3743 13.2019 37.5253V48.6435C13.2019 49.7948 14.1352 50.7282 15.2865 50.7282V52.8129L14.8604 52.7912C12.7579 52.5777 11.1172 50.8021 11.1172 48.6435Z" fill="url(#paint3_linear_120_18499)" />
        </G>
      </Svg>
    );
  }
  
  // Light mode SVG (activity light.svg)
  return (
    <Svg width={size} height={size} viewBox="0 0 67 67" fill="none">
      <Defs>
        <ClipPath id="clip0_120_18371">
          <Rect width="66.7074" height="66.7074" fill="white" />
        </ClipPath>
        <Filter id="filter0_f_120_18371" x="-9.78587" y="-9.29661" width="76.4941" height="66.5891" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <FeFlood floodOpacity="0" result="BackgroundImageFix" />
          <FeBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <FeGaussianBlur stdDeviation="5.55895" result="effect1_foregroundBlur_120_18371" />
        </Filter>
        <LinearGradient id="paint0_linear_120_18371" x1="28.4607" y1="1.82053" x2="28.4607" y2="46.1754" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#575757" />
          <Stop offset="1" stopColor="#151515" />
        </LinearGradient>
        <LinearGradient id="paint1_linear_120_18371" x1="28.4597" y1="1.82053" x2="28.4597" y2="46.1754" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#575757" />
          <Stop offset="1" stopColor="#151515" />
        </LinearGradient>
        <LinearGradient id="paint2_linear_120_18371" x1="68.0964" y1="43.0802" x2="11.1172" y2="43.0802" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#E3E3E5" stopOpacity="0.6" />
          <Stop offset="1" stopColor="#BBBBC0" stopOpacity="0.6" />
        </LinearGradient>
        <LinearGradient id="paint3_linear_120_18371" x1="38.2476" y1="20.9027" x2="38.2476" y2="46.5879" gradientUnits="userSpaceOnUse">
          <Stop stopColor="white" />
          <Stop offset="1" stopColor="white" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <G opacity="0.3" clipPath="url(#clip0_120_18371)">
        <Mask id="mask0_120_18371" maskUnits="userSpaceOnUse" x="0" y="-1" width="67" height="68">
          <Path d="M66.7074 -0.00146484H0V66.7059H66.7074V-0.00146484Z" fill="white" />
          <Path d="M33.353 61.0793V52.8076H15.2864C12.9838 52.8076 11.1172 50.9409 11.1172 48.6384L11.1172 37.5205C11.1172 35.218 12.9839 33.3513 15.2865 33.3513H33.353V25.0797C33.353 21.6318 37.2998 19.6741 40.0448 21.7603L63.7287 39.7602C65.9242 41.4284 65.9242 44.7304 63.7287 46.3987L40.0448 64.3986C37.2998 66.4848 33.353 64.527 33.353 61.0793Z" fill="black" />
        </Mask>
        <G mask="url(#mask0_120_18371)">
          <Path d="M33.3553 41.9976V33.7261H51.4219C53.7244 33.7261 55.5911 31.8594 55.5911 29.5569V18.4389C55.5911 16.1364 53.7244 14.2697 51.4219 14.2697H33.3553V5.99813C33.3553 2.55026 29.4085 0.592512 26.6634 2.67876L2.9795 20.6785C0.784177 22.347 0.784177 25.6488 2.9795 27.3173L26.6634 45.3171C29.4085 47.4034 33.3553 45.4455 33.3553 41.9976Z" fill="url(#paint0_linear_120_18371)" />
        </G>
        <Mask id="mask1_120_18371" maskUnits="userSpaceOnUse" x="11" y="20" width="55" height="46">
          <Path d="M33.353 61.0805V52.8088H15.2864C12.9838 52.8088 11.1172 50.9421 11.1172 48.6396L11.1172 37.5217C11.1172 35.2192 12.9839 33.3525 15.2865 33.3525H33.353V25.0809C33.353 21.633 37.2998 19.6753 40.0448 21.7615L63.7287 39.7614C65.9242 41.4296 65.9242 44.7317 63.7287 46.3999L40.0448 64.3998C37.2998 66.486 33.353 64.5282 33.353 61.0805Z" fill="white" />
        </Mask>
        <G mask="url(#mask1_120_18371)">
          <G filter="url(#filter0_f_120_18371)">
            <Path d="M33.3543 41.9976V33.7261H51.4209C53.7234 33.7261 55.5901 31.8594 55.5901 29.5569V18.4389C55.5901 16.1364 53.7234 14.2697 51.4209 14.2697H33.3543V5.99813C33.3543 2.55026 29.4075 0.592512 26.6624 2.67876L2.97852 20.6785C0.7832 22.347 0.7832 25.6488 2.97852 27.3173L26.6624 45.3171C29.4075 47.4034 33.3543 45.4455 33.3543 41.9976Z" fill="url(#paint1_linear_120_18371)" />
          </G>
        </G>
        <Path d="M33.353 61.08V52.8083H15.2864C12.9838 52.8083 11.1172 50.9416 11.1172 48.6391L11.1172 37.5212C11.1172 35.2187 12.9839 33.352 15.2865 33.352H33.353V25.0804C33.353 21.6325 37.2998 19.6748 40.0448 21.761L63.7287 39.7609C65.9242 41.4292 65.9242 44.7312 63.7287 46.3994L40.0448 64.3993C37.2998 66.4856 33.353 64.5277 33.353 61.08Z" fill="url(#paint2_linear_120_18371)" />
        <Path d="M11.1172 48.638V37.5201C11.1175 35.2176 12.984 33.3509 15.2864 33.3509H33.353V25.0803C33.353 21.6326 37.2987 19.6751 40.0437 21.7606L63.729 39.7592C65.9243 41.4278 65.924 44.73 63.729 46.3986L40.0437 64.3973C37.3846 66.4183 33.5979 64.6455 33.3638 61.398L33.353 61.0803V52.8072H15.2864V50.7226H35.4376V61.0803C35.4384 62.8036 37.4121 63.7817 38.7844 62.7388L62.4669 44.7401C63.5645 43.9059 63.5645 42.2546 62.4669 41.4205L38.7844 23.4191C37.4119 22.376 35.4376 23.3563 35.4376 25.0803V35.4355H15.2864C14.1353 35.4355 13.2021 36.3691 13.2018 37.5201V48.638C13.2018 49.7892 14.1351 50.7226 15.2864 50.7226V52.8072L14.8603 52.7855C12.7579 52.5721 11.1172 50.7965 11.1172 48.638Z" fill="url(#paint3_linear_120_18371)" />
      </G>
    </Svg>
  );
}

