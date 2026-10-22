import React from 'react'
import { BaseIcon, type BaseIconProps } from './baseIcon'

export const AlertTriangle: React.FC<BaseIconProps> = (props) => (
    <BaseIcon viewBox='0 0 15 15' size={15} fill='currentColor' {...props}>
        <path
            fillRule='evenodd'
            clipRule='evenodd'
            d='M8.4449 0.608765C8.0183 -0.107015 6.9817 -0.107015 6.55509 0.608766L0.161178 11.3368C-0.275824 12.07 0.252503 13 1.10608 13H13.8939C14.7475 13 15.2758 12.07 14.8388 11.3368L8.4449 0.608765ZM7.4141 1.12073C7.45288 1.05566 7.54712 1.05566 7.5859 1.12073L13.9798 11.8488C14.0196 11.9154 13.9715 12 13.8939 12H1.10608C1.02849 12 0.980454 11.9154 1.02018 11.8488L7.4141 1.12073ZM6.8269 4.48611C6.81221 4.10423 7.11783 3.78663 7.5 3.78663C7.88217 3.78663 8.18778 4.10423 8.1731 4.48612L8.01921 8.48701C8.00848 8.766 7.7792 8.98664 7.5 8.98664C7.2208 8.98664 6.99151 8.766 6.98078 8.48701L6.8269 4.48611ZM8.24989 10.476C8.24989 10.8902 7.9141 11.226 7.49989 11.226C7.08567 11.226 6.74989 10.8902 6.74989 10.476C6.74989 10.0618 7.08567 9.72599 7.49989 9.72599C7.9141 9.72599 8.24989 10.0618 8.24989 10.476Z'
        />
    </BaseIcon>
)
AlertTriangle.displayName = 'AlertTriangle'

export const AlertTriangleFill: React.FC<BaseIconProps> = (props) => (
    <BaseIcon viewBox='0 0 24 24' size={24} fill='currentColor' stroke='none' {...props}>
        <path stroke='none' d='M0 0h24v24H0z' fill='none' />
        <path d='M12 1.67c.955 0 1.845 .467 2.39 1.247l.105 .16l8.114 13.548a2.914 2.914 0 0 1 -2.307 4.363l-.195 .008h-16.225a2.914 2.914 0 0 1 -2.582 -4.2l.099 -.185l8.11 -13.538a2.914 2.914 0 0 1 2.491 -1.403zm.01 13.33l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007zm-.01 -7a1 1 0 0 0 -.993 .883l-.007 .117v4l.007 .117a1 1 0 0 0 1.986 0l.007 -.117v-4l-.007 -.117a1 1 0 0 0 -.993 -.883z' />
    </BaseIcon>
)
AlertTriangleFill.displayName = 'AlertTriangleFill'

export const PingingAlertTriangle: React.FC<
    BaseIconProps & {
        containerClassName?: string
    }
> = ({ containerClassName, ...rest }) => {
    const { className, ...restPingingProps } = rest

    return (
        <div className={'relative w-fit h-fit ' + containerClassName}>
            {/* The pinging triangle */}
            <BaseIcon
                viewBox='0 0 15 15'
                size={15}
                fill='currentColor'
                className={className + ' absolute top-0 left-0 animate-ping'}
                {...restPingingProps}
            >
                <path
                    fillRule='evenodd'
                    clipRule='evenodd'
                    d='M8.4449 0.608765C8.0183 -0.107015 6.9817 -0.107015 6.55509 0.608766L0.161178 11.3368C-0.275824 12.07 0.252503 13 1.10608 13H13.8939C14.7475 13 15.2758 12.07 14.8388 11.3368L8.4449 0.608765ZM7.4141 1.12073C7.45288 1.05566 7.54712 1.05566 7.5859 1.12073L13.9798 11.8488C14.0196 11.9154 13.9715 12 13.8939 12H1.10608C1.02849 12 0.980454 11.9154 1.02018 11.8488L7.4141 1.12073ZM6.8269 4.48611C6.81221 4.10423 7.11783 3.78663 7.5 3.78663C7.88217 3.78663 8.18778 4.10423 8.1731 4.48612L8.01921 8.48701C8.00848 8.766 7.7792 8.98664 7.5 8.98664C7.2208 8.98664 6.99151 8.766 6.98078 8.48701L6.8269 4.48611ZM8.24989 10.476C8.24989 10.8902 7.9141 11.226 7.49989 11.226C7.08567 11.226 6.74989 10.8902 6.74989 10.476C6.74989 10.0618 7.08567 9.72599 7.49989 9.72599C7.9141 9.72599 8.24989 10.0618 8.24989 10.476Z'
                />
            </BaseIcon>
            <BaseIcon viewBox='0 0 15 15' size={15} fill='currentColor' {...rest}>
                <path
                    fillRule='evenodd'
                    clipRule='evenodd'
                    d='M8.4449 0.608765C8.0183 -0.107015 6.9817 -0.107015 6.55509 0.608766L0.161178 11.3368C-0.275824 12.07 0.252503 13 1.10608 13H13.8939C14.7475 13 15.2758 12.07 14.8388 11.3368L8.4449 0.608765ZM7.4141 1.12073C7.45288 1.05566 7.54712 1.05566 7.5859 1.12073L13.9798 11.8488C14.0196 11.9154 13.9715 12 13.8939 12H1.10608C1.02849 12 0.980454 11.9154 1.02018 11.8488L7.4141 1.12073ZM6.8269 4.48611C6.81221 4.10423 7.11783 3.78663 7.5 3.78663C7.88217 3.78663 8.18778 4.10423 8.1731 4.48612L8.01921 8.48701C8.00848 8.766 7.7792 8.98664 7.5 8.98664C7.2208 8.98664 6.99151 8.766 6.98078 8.48701L6.8269 4.48611ZM8.24989 10.476C8.24989 10.8902 7.9141 11.226 7.49989 11.226C7.08567 11.226 6.74989 10.8902 6.74989 10.476C6.74989 10.0618 7.08567 9.72599 7.49989 9.72599C7.9141 9.72599 8.24989 10.0618 8.24989 10.476Z'
                />
            </BaseIcon>
        </div>
    )
}

export const Ambient: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <circle cx='12' cy='12' r='9.55' strokeDasharray='2 4' opacity={0.4} />
        <circle cx='12' cy='12' r='4' />
    </BaseIcon>
)
Ambient.displayName = 'Ambient'

export const ArrowLeft: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M19 12H5M12 19l-7-7 7-7'></path>
    </BaseIcon>
)
ArrowLeft.displayName = 'ArrowLeft'
export const ArrowRight: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M5 12h14M12 5l7 7-7 7'></path>
    </BaseIcon>
)
ArrowRight.displayName = 'ArrowRight'
export const ArrowUp: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M12 19V5M5 12l7-7 7 7'></path>
    </BaseIcon>
)
ArrowUp.displayName = 'ArrowUp'
export const ArrowDown: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M12 5v14M19 12l-7 7-7-7'></path>
    </BaseIcon>
)
ArrowDown.displayName = 'ArrowDown'
export const ArrowDownWideNarrow: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='m3 16 4 4 4-4'></path>
        <path d='M7 20V4'></path>
        <path d='M11 4h10'></path>
        <path d='M11 8h7'></path>
        <path d='M11 12h4'></path>
    </BaseIcon>
)
ArrowDownWideNarrow.displayName = 'ArrowDownWideNarrow'
export const ArrowUpNarrowWide: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='m3 8 4-4 4 4'></path>
        <path d='M7 4v16'></path>
        <path d='M11 12h4'></path>
        <path d='M11 16h7'></path>
        <path d='M11 20h10'></path>
    </BaseIcon>
)
ArrowUpNarrowWide.displayName = 'ArrowUpNarrowWide'
export const ChevronLeft: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M15 18l-6-6 6-6'></path>
    </BaseIcon>
)
ChevronLeft.displayName = 'ChevronLeft'
export const ChevronRight: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M9 18l6-6-6-6'></path>
    </BaseIcon>
)
ChevronRight.displayName = 'ChevronRight'
export const ChevronDown: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m6 9 6 6 6-6' />
    </BaseIcon>
)
ChevronDown.displayName = 'ChevronDown'
export const ChevronUp: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m18 15-6-6-6 6' />
    </BaseIcon>
)
ChevronUp.displayName = 'ChevronUp'
export const ChevronsLeft: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m11 17-5-5 5-5' />
        <path d='m18 17-5-5 5-5' />
    </BaseIcon>
)
ChevronsLeft.displayName = 'ChevronsLeft'
export const ChevronsRight: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m6 17 5-5-5-5' />
        <path d='m13 17 5-5-5-5' />
    </BaseIcon>
)
ChevronsRight.displayName = 'ChevronsRight'
export const Check: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M20 6 9 17l-5-5' />
    </BaseIcon>
)
Check.displayName = 'Check'
export const Move: React.FC<BaseIconProps> = (props) => (
    <BaseIcon size={15} {...props}>
        <path d='M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20'></path>
    </BaseIcon>
)
Move.displayName = 'Move'

export const Maximize2: React.FC<BaseIconProps> = (props) => (
    <BaseIcon size={15} {...props}>
        <path d='M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7'></path>
    </BaseIcon>
)
Maximize2.displayName = 'Maximize2'

export const Expand: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m15 15 6 6' />
        <path d='m15 9 6-6' />
        <path d='M21 16v5h-5' />
        <path d='M21 8V3h-5' />
        <path d='M3 16v5h5' />
        <path d='m3 21 6-6' />
        <path d='M3 8V3h5' />
        <path d='M9 9 3 3' />
    </BaseIcon>
)
Expand.displayName = 'Expand'

export const Minimize: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M8 3v3a2 2 0 0 1-2 2H3' />
        <path d='M21 8h-3a2 2 0 0 1-2-2V3' />
        <path d='M3 16h3a2 2 0 0 1 2 2v3' />
        <path d='M16 21v-3a2 2 0 0 1 2-2h3' />
    </BaseIcon>
)
Minimize.displayName = 'Minimize'

export const Minimize2: React.FC<BaseIconProps> = (props) => (
    <BaseIcon size={15} {...props}>
        <path d='M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7'></path>
    </BaseIcon>
)

// Material Symbols glyph (filled, 960 grid) — overrides BaseIcon's Lucide defaults.
export const Compress: React.FC<BaseIconProps> = (props) => (
    <BaseIcon viewBox='0 -960 960 960' fill='currentColor' {...props}>
        <path d='M160-400v-80h640v80H160Zm0-120v-80h640v80H160ZM440-80v-128l-64 64-56-56 160-160 160 160-56 56-64-62v126h-80Zm40-560L320-800l56-56 64 64v-128h80v128l64-64 56 56-160 160Z' />
    </BaseIcon>
)
Compress.displayName = 'Compress'

export const Globe: React.FC<BaseIconProps> = (props) => (
    <BaseIcon size={15} {...props}>
        <circle cx='12' cy='12' r='10'></circle>
        <path d='M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z'></path>
    </BaseIcon>
)
Globe.displayName = 'Globe'

export const NetworkProxy: React.FC<BaseIconProps> = ({ className, ...props }) => (
    <Globe className={'text-blue-500 ' + className} {...props} />
)
NetworkProxy.displayName = 'NetworkProxy'

export const GlobeOff: React.FC<BaseIconProps> = (props) => (
    <BaseIcon size={15} {...props}>
        <path d='M10.114 4.462A14.5 14.5 0 0 1 12 2a10 10 0 0 1 9.313 13.643'></path>
        <path d='M15.557 15.556A14.5 14.5 0 0 1 12 22 10 10 0 0 1 4.929 4.929'></path>
        <path d='M15.892 10.234A14.5 14.5 0 0 0 12 2a10 10 0 0 0-3.643.687'></path>
        <path d='M17.656 12H22'></path>
        <path d='M19.071 19.071A10 10 0 0 1 12 22 14.5 14.5 0 0 1 8.44 8.45'></path>
        <path d='M2 12h10'></path>
        <path d='m2 2 20 20'></path>
    </BaseIcon>
)
GlobeOff.displayName = 'GlobeOff'

export const SkipForward: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M5 4l10 8-10 8V4zM19 5v14'></path>
    </BaseIcon>
)
SkipForward.displayName = 'SkipForward'

export const SkipBack: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M19 20L9 12l10-8v16zM5 19V5'></path>
    </BaseIcon>
)
SkipBack.displayName = 'SkipBack'

export const Pause: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path fill='' d='M6 4h4v16H6zM14 4h4v16h-4z'></path>
    </BaseIcon>
)
Pause.displayName = 'Pause'

export const PauseFill: React.FC<BaseIconProps> = (props) => (
    <BaseIcon fill='currentColor' stroke='none' {...props}>
        <path d='M6 4h4v16H6zM14 4h4v16h-4z'></path>
    </BaseIcon>
)
PauseFill.displayName = 'PauseFill'

export const Play: React.FC<BaseIconProps> = (props) => (
    <BaseIcon fill='currentColor' stroke='none' {...props}>
        <path d='M5 3l14 9-14 9V3z'></path>
    </BaseIcon>
)
Play.displayName = 'Play'

export const Square: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <rect width='18' height='18' x='3' y='3' rx='2' ry='2'></rect>
    </BaseIcon>
)
Square.displayName = 'Square'

export const SquareFill: React.FC<BaseIconProps> = (props) => (
    <BaseIcon fill='currentColor' stroke='none' {...props}>
        <rect width='18' height='18' x='3' y='3' rx='2' ry='2'></rect>
    </BaseIcon>
)
SquareFill.displayName = 'SquareFill'

export const Info: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <circle cx='12' cy='12' r='10' fill=''></circle>
        <path stroke='' d='M12 16v-4M12 8h.01'></path>
    </BaseIcon>
)
Info.displayName = 'Info'

export const X: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={3} {...props}>
        <path d='M18 6L6 18M6 6l12 12'></path>
    </BaseIcon>
)
X.displayName = 'X'

export const RefreshCcw: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M1 4v6h6M23 20v-6h-6'></path>
        <path d='M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15'></path>
    </BaseIcon>
)
RefreshCcw.displayName = 'RefreshCcw'

export const Circle: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='12' cy='12' r='10' />
    </BaseIcon>
)
Circle.displayName = 'Circle'

export const Minus: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M5 12h14' />
    </BaseIcon>
)
Minus.displayName = 'Minus'

export const Plus: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M5 12h14' />
        <path d='M12 5v14' />
    </BaseIcon>
)
Minus.displayName = 'Plus'

export const Share: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={0.5} {...props}>
        <path
            d='M18 9C19.6569 9 21 7.65685 21 6C21 4.34315 19.6569 3 18 3C16.3431 3 15 4.34315 15 6C15 6.12549 15.0077 6.24919 15.0227 6.37063L8.08261 9.84066C7.54305 9.32015 6.80891 9 6 9C4.34315 9 3 10.3431 3 12C3 13.6569 4.34315 15 6 15C6.80891 15 7.54305 14.6798 8.08261 14.1593L15.0227 17.6294C15.0077 17.7508 15 17.8745 15 18C15 19.6569 16.3431 21 18 21C19.6569 21 21 19.6569 21 18C21 16.3431 19.6569 15 18 15C17.1911 15 16.457 15.3202 15.9174 15.8407L8.97733 12.3706C8.99229 12.2492 9 12.1255 9 12C9 11.8745 8.99229 11.7508 8.97733 11.6294L15.9174 8.15934C16.457 8.67985 17.1911 9 18 9Z'
            fill='currentColor'
        />
    </BaseIcon>
)
Share.displayName = 'Share'
export const Comment: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={0.5} {...props}>
        <path d='M17 9H7V7H17V9Z' fill='currentColor' />
        <path d='M7 13H17V11H7V13Z' fill='currentColor' />
        <path
            fillRule='evenodd'
            clipRule='evenodd'
            d='M2 18V2H22V18H16V22H14C11.7909 22 10 20.2091 10 18H2ZM12 16V18C12 19.1046 12.8954 20 14 20V16H20V4H4V16H12Z'
            fill='currentColor'
        />
    </BaseIcon>
)
Comment.displayName = 'Comment'

export const Download: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 15V3' />
        <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
        <path d='m7 10 5 5 5-5' />
    </BaseIcon>
)
Download.displayName = 'Download'
export const File: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' />
        <path d='M14 2v4a2 2 0 0 0 2 2h4' />
    </BaseIcon>
)
File.displayName = 'File'
export const Trash2: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M10 11v6' />
        <path d='M14 11v6' />
        <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' />
        <path d='M3 6h18' />
        <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
    </BaseIcon>
)
Trash2.displayName = 'Trash2'
export const CircleCheck: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='12' cy='12' r='10' />
        <path d='m9 12 2 2 4-4' />
    </BaseIcon>
)
CircleCheck.displayName = 'CircleCheck'

export const Activity: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2' />
    </BaseIcon>
)
Activity.displayName = 'Activity'

export const CirclePlus: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='12' cy='12' r='10' />
        <path d='M8 12h8' />
        <path d='M12 8v8' />
    </BaseIcon>
)
CirclePlus.displayName = 'CirclePlus'
export const Sparkles: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'></path>
        <path d='M20 3v4M22 5h-4M6 16v4M8 18H4'></path>
    </BaseIcon>
)
Sparkles.displayName = 'Sparkles'

export const Sparkles2: React.FC<BaseIconProps> = (props) => (
    <BaseIcon viewBox='0 0 512 512' fill='currentColor' stroke='none' {...props}>
        <path d='m208 512-52.38-139.62L16 320l139.62-52.38L208 128l52.38 139.62L400 320l-139.62 52.38ZM88 176l-23.57-64.43L0 88l64.43-23.57L88 0l23.57 64.43L176 88l-64.43 23.57ZM400 256l-31.11-80.89L288 144l80.89-31.11L400 32l31.11 80.89L512 144l-80.89 31.11Z' />
    </BaseIcon>
)
Sparkles2.displayName = 'Sparkles2'

export const EyeOff: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49' />
        <path d='M14.084 14.158a3 3 0 0 1-4.242-4.242' />
        <path d='M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143' />
        <path d='m2 2 20 20' />
    </BaseIcon>
)
EyeOff.displayName = 'EyeOff'

export const Eye: React.FC<BaseIconProps> = (props) => (
    <BaseIcon size={20} strokeWidth={0.5} {...props}>
        <path
            fillRule='evenodd'
            clipRule='evenodd'
            d='M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12ZM14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12Z'
            fill='currentColor'
        />
        <path
            fillRule='evenodd'
            clipRule='evenodd'
            d='M12 3C17.5915 3 22.2898 6.82432 23.6219 12C22.2898 17.1757 17.5915 21 12 21C6.40848 21 1.71018 17.1757 0.378052 12C1.71018 6.82432 6.40848 3 12 3ZM12 19C7.52443 19 3.73132 16.0581 2.45723 12C3.73132 7.94186 7.52443 5 12 5C16.4756 5 20.2687 7.94186 21.5428 12C20.2687 16.0581 16.4756 19 12 19Z'
            fill='currentColor'
        />
    </BaseIcon>
)
Eye.displayName = 'Eye'

export const Calendar: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M8 2v4' />
        <path d='M16 2v4' />
        <rect width='18' height='18' x='3' y='4' rx='2' />
        <path d='M3 10h18' />
    </BaseIcon>
)
Calendar.displayName = 'Calendar'

export const Menu: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M4 12h16' />
        <path d='M4 18h16' />
        <path d='M4 6h16' />
    </BaseIcon>
)
Menu.displayName = 'Menu'

export const MailCheck: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8' />
        <path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' />
        <path d='m16 19 2 2 4-4' />
    </BaseIcon>
)
MailCheck.displayName = 'MailCheck'

export const Archive: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <rect width='20' height='5' x='2' y='3' rx='1' />
        <path d='M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' />
        <path d='M10 12h4' />
    </BaseIcon>
)
Archive.displayName = 'Archive'

export const Clock: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 6v6l4 2' />
        <circle cx='12' cy='12' r='10' />
    </BaseIcon>
)
Clock.displayName = 'Clock'
export const CalendarPlus: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M16 19h6' />
        <path d='M16 2v4' />
        <path d='M19 16v6' />
        <path d='M21 12.598V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8.5' />
        <path d='M3 10h18' />
        <path d='M8 2v4' />
    </BaseIcon>
)
CalendarPlus.displayName = 'CalendarPlus'

//  Filter
export const Filter: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M2 5h20' />
        <path d='M6 12h12' />
        <path d='M9 19h6' />
    </BaseIcon>
)
Filter.displayName = 'Filter'

export const Funnel: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z' />
    </BaseIcon>
)
Funnel.displayName = 'Funnel'

export const Terminal: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 19h8' />
        <path d='m4 17 6-6-6-6' />
    </BaseIcon>
)
Terminal.displayName = 'Terminal'

export const Tag: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z' />
        <circle cx='7.5' cy='7.5' r='.5' fill='currentColor' />
    </BaseIcon>
)
Tag.displayName = 'Tag'

// Volume
export const VolumeX: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z' />
        <line x1='22' x2='16' y1='9' y2='15' />
        <line x1='16' x2='22' y1='9' y2='15' />
    </BaseIcon>
)
VolumeX.displayName = 'VolumeX'

// User round x
export const UserRoundX: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M2 21a8 8 0 0 1 11.873-7' />
        <circle cx='10' cy='8' r='5' />
        <path d='m17 17 5 5' />
        <path d='m22 17-5 5' />
    </BaseIcon>
)
UserRoundX.displayName = 'UserRoundX'

// Trash
export const Trash: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' />
        <path d='M3 6h18' />
        <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
    </BaseIcon>
)
Trash.displayName = 'Trash'

// Bot
export const Bot: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 8V4H8' />
        <rect width='16' height='12' x='4' y='8' rx='2' />
        <path d='M2 14h2' />
        <path d='M20 14h2' />
        <path d='M15 13v2' />
        <path d='M9 13v2' />
    </BaseIcon>
)
Bot.displayName = 'Bot'

// Search
export const Search: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m21 21-4.34-4.34' />
        <circle cx='11' cy='11' r='8' />
    </BaseIcon>
)
Search.displayName = 'Search'

// Star
export const Star: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' />
    </BaseIcon>
)
Star.displayName = 'Star'

// Audio
export const Audio: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M2 10v3' />
        <path d='M6 6v11' />
        <path d='M10 3v18' />
        <path d='M14 8v7' />
        <path d='M18 5v13' />
        <path d='M22 10v3' />
    </BaseIcon>
)
Audio.displayName = 'Audio'

// Bluetooth
export const Bluetooth: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m7 7 10 10-5 5V2l5 5L7 17' />
    </BaseIcon>
)
Bluetooth.displayName = 'Bluetooth'

export const MoveVertical: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 2v20' />
        <path d='m8 18 4 4 4-4' />
        <path d='m8 6 4-4 4 4' />
    </BaseIcon>
)
MoveVertical.displayName = 'MoveVertical'

export const Folder: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' />
    </BaseIcon>
)
Folder.displayName = 'Folder'

export const FolderOpen: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2' />
    </BaseIcon>
)
FolderOpen.displayName = 'FolderOpen'

export const FileCode: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' />
        <path d='M14 2v5a1 1 0 0 0 1 1h5' />
        <path d='M10 12.5 8 15l2 2.5' />
        <path d='m14 12.5 2 2.5-2 2.5' />
    </BaseIcon>
)
FileCode.displayName = 'FileCode'

export const ShoppingBag: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M16 10a4 4 0 0 1-8 0' />
        <path d='M3.103 6.034h17.794' />
        <path d='M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z' />
    </BaseIcon>
)
ShoppingBag.displayName = 'ShoppingBag'

export const Logout: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m16 17 5-5-5-5' />
        <path d='M21 12H9' />
        <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' />
    </BaseIcon>
)
Logout.displayName = 'Logout'

export const FileText: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' />
        <path d='M14 2v5a1 1 0 0 0 1 1h5' />
        <path d='M10 9H8' />
        <path d='M16 13H8' />
        <path d='M16 17H8' />
    </BaseIcon>
)
FileText.displayName = 'FileText'

export const Monitor: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <rect width='20' height='14' x='2' y='3' rx='2' />
        <line x1='8' x2='16' y1='21' y2='21' />
        <line x1='12' x2='12' y1='17' y2='21' />
    </BaseIcon>
)
Monitor.displayName = 'Monitor'

export const Moon: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401' />
    </BaseIcon>
)
Moon.displayName = 'Moon'

export const Sun: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='12' cy='12' r='4' />
        <path d='M12 2v2' />
        <path d='M12 20v2' />
        <path d='m4.93 4.93 1.41 1.41' />
        <path d='m17.66 17.66 1.41 1.41' />
        <path d='M2 12h2' />
        <path d='M20 12h2' />
        <path d='m6.34 17.66-1.41 1.41' />
        <path d='m19.07 4.93-1.41 1.41' />
    </BaseIcon>
)
Sun.displayName = 'Sun'

export const Pallet: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z' />
        <circle cx='13.5' cy='6.5' r='.5' fill='currentColor' />
        <circle cx='17.5' cy='10.5' r='.5' fill='currentColor' />
        <circle cx='6.5' cy='12.5' r='.5' fill='currentColor' />
        <circle cx='8.5' cy='7.5' r='.5' fill='currentColor' />
    </BaseIcon>
)
Pallet.displayName = 'Pallet'

export const Layers: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z' />
        <path d='M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12' />
        <path d='M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17' />
    </BaseIcon>
)
Layers.displayName = 'Layers'

export const Save: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' />
        <path d='M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7' />
        <path d='M7 3v4a1 1 0 0 0 1 1h7' />
    </BaseIcon>
)
Save.displayName = 'Save'

export const FolderSearch: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1' />
        <path d='m21 21-1.9-1.9' />
        <circle cx='17' cy='17' r='3' />
    </BaseIcon>
)
FolderSearch.displayName = 'FolderSearch'

export const MoveHorizontal: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m18 8 4 4-4 4' />
        <path d='M2 12h20' />
        <path d='m6 8-4 4 4 4' />
    </BaseIcon>
)
MoveHorizontal.displayName = 'MoveHorizontal'

export const OctagonX: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m15 9-6 6' />
        <path d='M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z' />
        <path d='m9 9 6 6' />
    </BaseIcon>
)
OctagonX.displayName = 'OctagonX'

export const GripVertical: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='9' cy='12' r='1' />
        <circle cx='9' cy='5' r='1' />
        <circle cx='9' cy='19' r='1' />
        <circle cx='15' cy='12' r='1' />
        <circle cx='15' cy='5' r='1' />
        <circle cx='15' cy='19' r='1' />
    </BaseIcon>
)
GripVertical.displayName = 'GripVertical'

export const LockClosed: React.FC<BaseIconProps> = (props) => (
    <BaseIcon size={15} {...props}>
        <rect width='18' height='11' x='3' y='11' rx='2' ry='2'></rect>
        <path d='M7 11V7a5 5 0 0 1 10 0v4'></path>
    </BaseIcon>
)
LockClosed.displayName = 'LockClosed'

export const Lock: React.FC<BaseIconProps> = (props) => (
    <BaseIcon size={15} {...props}>
        <rect width='18' height='11' x='3' y='11' rx='2' ry='2'></rect>
        <path d='M7 11V7a5 5 0 0 1 10 0v4'></path>
    </BaseIcon>
)
Lock.displayName = 'Lock'

export const LockOpen: React.FC<BaseIconProps> = (props) => (
    <BaseIcon size={15} {...props}>
        <rect width='18' height='11' x='3' y='11' rx='2' ry='2'></rect>
        <path d='M7 11V7a5 5 0 0 1 9.9-1'></path>
    </BaseIcon>
)
LockOpen.displayName = 'LockOpen'

export const Key: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z' />
        <circle cx='16.5' cy='7.5' r='.5' fill='currentColor' />
    </BaseIcon>
)
Key.displayName = 'Key'

export const KeyRound: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z' />
        <circle cx='16.5' cy='7.5' r='.5' fill='currentColor' />
    </BaseIcon>
)
KeyRound.displayName = 'KeyRound'

export const MessageSquare: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z' />
    </BaseIcon>
)
MessageSquare.displayName = 'MessageSquare'

export const MessagesSquare: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' />
        <path d='M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1' />
    </BaseIcon>
)
MessagesSquare.displayName = 'MessagesSquare'

export const MessageSquareCode: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z' />
        <path d='m10 8-3 3 3 3' />
        <path d='m14 14 3-3-3-3' />
    </BaseIcon>
)
MessageSquareCode.displayName = 'MessageSquareCode'

export const Type: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 4v16' />
        <path d='M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2' />
        <path d='M9 20h6' />
    </BaseIcon>
)
Type.displayName = 'Type'

export const Cable: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z' />
        <path d='M17 21v-2' />
        <path d='M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10' />
        <path d='M21 21v-2' />
        <path d='M3 5V3' />
        <path d='M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z' />
        <path d='M7 5V3' />
    </BaseIcon>
)
Cable.displayName = 'Cable'

export const Vault: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={1} {...props}>
        <rect width='18' height='18' x='3' y='3' rx='2' />
        <circle cx='7.5' cy='7.5' r='.5' fill='currentColor' />
        <path d='m7.9 7.9 2.7 2.7' />
        <circle cx='16.5' cy='7.5' r='.5' fill='currentColor' />
        <path d='m13.4 10.6 2.7-2.7' />
        <circle cx='7.5' cy='16.5' r='.5' fill='currentColor' />
        <path d='m7.9 16.1 2.7-2.7' />
        <circle cx='16.5' cy='16.5' r='.5' fill='currentColor' />
        <path d='m13.4 13.4 2.7 2.7' />
        <circle cx='12' cy='12' r='2' />
    </BaseIcon>
)
Vault.displayName = 'Vault'

export const BrainCircuit: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z' />
        <path d='M9 13a4.5 4.5 0 0 0 3-4' />
        <path d='M6.003 5.125A3 3 0 0 0 6.401 6.5' />
        <path d='M3.477 10.896a4 4 0 0 1 .585-.396' />
        <path d='M6 18a4 4 0 0 1-1.967-.516' />
        <path d='M12 13h4' />
        <path d='M12 18h6a2 2 0 0 1 2 2v1' />
        <path d='M12 8h8' />
        <path d='M16 8V5a2 2 0 0 1 2-2' />
        <circle cx='16' cy='13' r='.5' />
        <circle cx='18' cy='3' r='.5' />
        <circle cx='20' cy='21' r='.5' />
        <circle cx='20' cy='8' r='.5' />
    </BaseIcon>
)
BrainCircuit.displayName = 'BrainCircuit'

export const Brain: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 18V5' />
        <path d='M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4' />
        <path d='M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5' />
        <path d='M17.997 5.125a4 4 0 0 1 2.526 5.77' />
        <path d='M18 18a4 4 0 0 0 2-7.464' />
        <path d='M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517' />
        <path d='M6 18a4 4 0 0 1-2-7.464' />
        <path d='M6.003 5.125a4 4 0 0 0-2.526 5.77' />
    </BaseIcon>
)
Brain.displayName = 'Brain'

export const Clipboard: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <rect width='8' height='4' x='8' y='2' rx='1' ry='1' />
        <path d='M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' />
    </BaseIcon>
)
Clipboard.displayName = 'Clipboard'

export const Ellipsis: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='12' cy='12' r='1' />
        <circle cx='19' cy='12' r='1' />
        <circle cx='5' cy='12' r='1' />
    </BaseIcon>
)
Ellipsis.displayName = 'Ellipsis'

export const Copy: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <rect width='14' height='14' x='8' y='8' rx='2' ry='2' />
        <path d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' />
    </BaseIcon>
)
Copy.displayName = 'Copy'

export const History: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' />
        <path d='M3 3v5h5' />
        <path d='M12 7v5l4 2' />
    </BaseIcon>
)
History.displayName = 'History'

export const ChevronsLeftRightEllipsis: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 12h.01' />
        <path d='M16 12h.01' />
        <path d='m17 7 5 5-5 5' />
        <path d='m7 7-5 5 5 5' />
        <path d='M8 12h.01' />
    </BaseIcon>
)
ChevronsLeftRightEllipsis.displayName = 'ChevronsLeftRightEllipsis'

export const ChevronsLeftRight: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m9 18-6-6 6-6' />
        <path d='m15 18 6-6-6-6' />
        <path d='m3 12 18 0' />
    </BaseIcon>
)
ChevronsLeftRight.displayName = 'ChevronsLeftRight'

export const Option: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M3 3h6l6 18h6' />
        <path d='M14 3h7' />
    </BaseIcon>
)
Option.displayName = 'Option'

export const Split: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <g transform='rotate(90, 12, 12)'>
            <path d='M16 3h5v5' />
            <path d='M8 3H3v5' />
            <path d='M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3' />
            <path d='m15 9 6-6' />
        </g>
    </BaseIcon>
)
Split.displayName = 'Split'

export const GitPullRequestArrow: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='5' cy='6' r='3' />
        <path d='M5 9v12' />
        <circle cx='19' cy='18' r='3' />
        <path d='m15 9-3-3 3-3' />
        <path d='M12 6h5a2 2 0 0 1 2 2v7' />
    </BaseIcon>
)
GitPullRequestArrow.displayName = 'GitPullRequestArrow'

export const GitGraph: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='5' cy='6' r='3' />
        <path d='M5 9v6' />
        <circle cx='5' cy='18' r='3' />
        <path d='M12 3v18' />
        <circle cx='19' cy='6' r='3' />
        <path d='M16 15.7A9 9 0 0 0 19 9' />
    </BaseIcon>
)
GitGraph.displayName = 'GitGraph'

export const ListTree: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M8 5h13' />
        <path d='M13 12h8' />
        <path d='M13 19h8' />
        <path d='M3 10a2 2 0 0 0 2 2h3' />
        <path d='M3 5v12a2 2 0 0 0 2 2h3' />
    </BaseIcon>
)
ListTree.displayName = 'ListTree'

export const Merge: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <g transform='rotate(90, 12, 12)'>
            <path d='m8 6 4-4 4 4' />
            <path d='M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22' />
            <path d='m20 22-5-5' />
        </g>
    </BaseIcon>
)
Merge.displayName = 'Merge'

// Arrow left right
export const ArrowLeftRight: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M8 3 4 7l4 4' />
        <path d='M4 7h16' />
        <path d='m16 21 4-4-4-4' />
        <path d='M20 17H4' />
    </BaseIcon>
)
ArrowLeftRight.displayName = 'ArrowLeftRight'

// Arrow right right — two parallel arrows both pointing right
export const ArrowRightRight: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='m16 3 4 4-4 4' />
        <path d='M4 7h16' />
        <path d='m16 13 4 4-4 4' />
        <path d='M4 17h16' />
    </BaseIcon>
)
ArrowRightRight.displayName = 'ArrowRightRight'

export const Undo: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M9 14 4 9l5-5' />
        <path d='M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' />
    </BaseIcon>
)
Undo.displayName = 'Undo'

export const Redo: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='m15 14 5-5-5-5' />
        <path d='M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13' />
    </BaseIcon>
)
Redo.displayName = 'Redo'

export const Power: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={props.strokeWidth ?? 2.5} {...props}>
        <path d='M12 2v10' />
        <path d='M18.4 6.6a9 9 0 1 1-12.77.04' />
    </BaseIcon>
)
Power.displayName = 'Power'

export const Hammer: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M15 12L5.627 21.373a1 1 0 0 1-3.001-3L12 9Z' />
        <path d='M21.5 11.5l-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5Z' />
    </BaseIcon>
)
Hammer.displayName = 'Hammer'

export const PencilRuler: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13' />
        <path d='m8 6 2-2' />
        <path d='m18 16 2-2' />
        <path d='m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17' />
        <path d='M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' />
        <path d='m15 5 4 4' />
    </BaseIcon>
)
PencilRuler.displayName = 'PencilRuler'

export const SwatchBook: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z' />
        <path d='M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7' />
        <path d='M7 17h.01' />
        <path d='m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8' />
    </BaseIcon>
)
SwatchBook.displayName = 'SwatchBook'

export const Toolbox: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M16 12v4' />
        <path d='M16 6a2 2 0 0 1 1.414.586l4 4A2 2 0 0 1 22 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 .586-1.414l4-4A2 2 0 0 1 8 6z' />
        <path d='M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2' />
        <path d='M2 14h20' />
        <path d='M8 12v4' />
    </BaseIcon>
)
Toolbox.displayName = 'Toolbox'

export const Mail: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7' />
        <rect x='2' y='4' width='20' height='16' rx='2' />
    </BaseIcon>
)
Mail.displayName = 'Mail'

export const Wrench: React.FC<BaseIconProps> = (props) => (
    <BaseIcon viewBox='0 0 16 16' fill='currentColor' stroke='none' {...props}>
        <path
            transform='rotate(45, 8, 8)'
            d='M5.433 2.304A4.492 4.492 0 0 0 3.5 6c0 1.598.832 3.002 2.09 3.802.518.328.929.923.902 1.64v.008l-.164 3.337a.75.75 0 1 1-1.498-.073l.163-3.33c.002-.085-.05-.216-.207-.316A5.996 5.996 0 0 1 2 6a5.993 5.993 0 0 1 2.567-4.92 1.482 1.482 0 0 1 1.673-.04c.462.296.76.827.76 1.423v2.82c0 .082.041.16.11.206l.75.51a.25.25 0 0 0 .28 0l.75-.51A.249.249 0 0 0 9 5.282V2.463c0-.596.298-1.127.76-1.423a1.482 1.482 0 0 1 1.673.04A5.993 5.993 0 0 1 14 6a5.996 5.996 0 0 1-2.786 5.068c-.157.1-.209.23-.207.315l.163 3.33a.752.752 0 0 1-1.094.714.75.75 0 0 1-.404-.64l-.164-3.345c-.027-.717.384-1.312.902-1.64A4.495 4.495 0 0 0 12.5 6a4.492 4.492 0 0 0-1.933-3.696c-.024.017-.067.067-.067.16v2.818a1.75 1.75 0 0 1-.767 1.448l-.75.51a1.75 1.75 0 0 1-1.966 0l-.75-.51A1.75 1.75 0 0 1 5.5 5.282V2.463c0-.092-.043-.142-.067-.159Z'
        />
    </BaseIcon>
)
Wrench.displayName = 'Wrench'

export const Tool = Wrench

export const Brackets: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3' />
        <path d='M8 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3' />
    </BaseIcon>
)
Brackets.displayName = 'Brackets'

export const Scissors: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='6' cy='6' r='3' />
        <path d='M8.12 8.12 12 12' />
        <path d='M20 4 8.12 15.88' />
        <circle cx='6' cy='18' r='3' />
        <path d='M14.8 14.8 20 20' />
    </BaseIcon>
)
Scissors.displayName = 'Scissors'

export const Braces: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1' />
        <path d='M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1' />
    </BaseIcon>
)
Braces.displayName = 'Braces'

export const Image: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <rect width='18' height='18' x='3' y='3' rx='2' ry='2' />
        <circle cx='9' cy='9' r='2' />
        <path d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' />
    </BaseIcon>
)
Image.displayName = 'Image'

export const Pretzel: React.FC<BaseIconProps> = ({ className, ...rest }) => (
    <BaseIcon viewBox='0 0 100 100' fill='currentColor' className={'text-primary ' + className} {...rest}>
        <path d='M96.523,49.048c0-7.743-2.76-15.61-7.571-21.583c-2.499-3.101-5.418-5.565-8.676-7.323c-3.588-1.937-7.404-2.918-11.345-2.918c-8.14,0-14.486,3.934-19.17,8.645c-4.684-4.711-11.03-8.645-19.169-8.645c-3.94,0-7.756,0.981-11.345,2.918c-3.258,1.758-6.176,4.222-8.675,7.323C5.761,33.438,3,41.305,3,49.048c0,9.417,3.963,17.937,11.168,24.035c-0.519,1.914-0.129,4.042,1.231,5.684c2.223,2.687,6.204,3.059,8.891,0.835l0.316-0.263c6.779,2.8,14.945,4.261,24.406,4.371c0.12,0.005,0.238,0.01,0.357,0.01c0.13,0,0.26-0.003,0.392-0.005c0.133,0.002,0.262,0.005,0.393,0.005c0.119,0,0.239-0.005,0.357-0.01c9.46-0.11,17.628-1.571,24.404-4.371l0.318,0.263c2.686,2.224,6.666,1.852,8.892-0.835c1.359-1.642,1.749-3.77,1.23-5.684C92.562,66.984,96.523,58.465,96.523,49.048z M23.175,64.127c-0.231-0.177-0.458-0.359-0.678-0.539c-5.677-4.705-6.867-10.503-6.867-14.54c0-10.046,7.132-19.196,14.962-19.196c4.039,0,7.915,2.127,11.535,6.324c-1.656,2.967-2.518,5.165-2.629,5.456c-1.035,2.703-0.673,5.843,0.793,8.318L23.175,64.127z M49.762,71.089c-4.982-0.023-9.523-0.482-13.547-1.362l13.547-11.225l13.549,11.225C59.284,70.606,54.745,71.065,49.762,71.089z M77.027,63.588c-0.222,0.18-0.447,0.362-0.679,0.539L59.233,49.95c1.464-2.475,1.828-5.616,0.792-8.318c-0.111-0.291-0.975-2.492-2.634-5.461c2.915-3.381,6.807-6.318,11.54-6.318c7.831,0,14.964,9.15,14.964,19.196C83.896,53.085,82.703,58.883,77.027,63.588z' />
    </BaseIcon>
)
Pretzel.displayName = 'Pretzel'

export const SquarePen: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
        <path d='M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z' />
    </BaseIcon>
)
SquarePen.displayName = 'SquarePen'

export const LogIn: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='m10 17 5-5-5-5' />
        <path d='M15 12H3' />
        <path d='M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' />
    </BaseIcon>
)
LogIn.displayName = 'LogIn'

export const LogOut: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='m16 17 5-5-5-5' />
        <path d='M21 12H9' />
        <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' />
    </BaseIcon>
)
LogOut.displayName = 'LogOut'

export const PortalIn: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='m7 15 3-3-3-3' />
        <path d='M10 12H4' />
        <path d='M15 3 C22 3 22 21 15 21' />
        <path d='M10 3 C17 3 17 21 10 21' />
    </BaseIcon>
)
PortalIn.displayName = 'PortalIn'

export const PortalOut: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='m18 15 3-3-3-3' />
        <path d='M14 12H20' />
        <path d='M9 3 C2 3 2 21 9 21' />
        <path d='M14 3 C7 3 7 21 14 21' />
    </BaseIcon>
)
PortalOut.displayName = 'PortalOut'

export const ArrowBigUpDash: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M14 16a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-6.939-6.939a1.207 1.207 0 0 0-1.708 0l-6.94 6.94a.707.707 0 0 0 .5 1.206H8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1z' />
        <path d='M9 20h6' />
    </BaseIcon>
)
ArrowBigUpDash.displayName = 'ArrowBigUpDash'

export const CloudUpload: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 13v8' />
        <path d='M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242' />
        <path d='m8 17 4-4 4 4' />
    </BaseIcon>
)
CloudUpload.displayName = 'CloudUpload'

export const Webhook: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2' />
        <path d='m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06' />
        <path d='m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8' />
    </BaseIcon>
)
Webhook.displayName = 'Webhook'

export const WebSocket: React.FC<BaseIconProps> = (props) => (
    <BaseIcon viewBox='0 -31.5 256 256' fill='currentColor' stroke='none' {...props}>
        <path d='M192.440223,144.644612 L224.220111,144.644612 L224.220111,68.3393384 L188.415329,32.5345562 L165.943007,55.0068785 L192.440223,81.5040943 L192.440223,144.644612 L192.440223,144.644612 Z M224.303963,160.576482 L178.017688,160.576482 L113.451687,160.576482 L86.954471,134.079266 L98.1906322,122.843105 L120.075991,144.728464 L165.104487,144.728464 L120.746806,100.286931 L132.06682,88.9669178 L176.4245,133.324599 L176.4245,88.2961022 L154.622994,66.4945955 L165.775303,55.3422863 L110.684573,0 L56.3485097,0 L56.3485097,0 L0,0 L31.6960367,31.6960367 L31.6960367,31.7798886 L31.8637406,31.7798886 L97.4359646,31.7798886 L120.662954,55.0068785 L86.7029152,88.9669178 L63.4759253,65.7399279 L63.4759253,47.7117589 L31.6960367,47.7117589 L31.6960367,78.9046839 L86.7029152,133.911562 L64.3144448,156.300033 L100.119227,192.104815 L154.45529,192.104815 L256,192.104815 L256,192.104815 L224.303963,160.576482 L224.303963,160.576482 Z'></path>
    </BaseIcon>
)
WebSocket.displayName = 'WebSocket'

export const GatewayConnection: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 12h.01' />
        <path d='M16 12h.01' />
        <path d='m17 7 5 5-5 5' />
        <path d='m7 7-5 5 5 5' />
        <path d='M8 12h.01' />
    </BaseIcon>
)
GatewayConnection.displayName = 'GatewayConnection'

export const Graph: React.FC<BaseIconProps> = (props) => (
    <BaseIcon viewBox='0 0 256 256' fill='currentColor' stroke='none' {...props}>
        <path d='M160,112h48a16,16,0,0,0,16-16V48a16,16,0,0,0-16-16H160a16,16,0,0,0-16,16V64H128a24,24,0,0,0-24,24v32H72v-8A16,16,0,0,0,56,96H24A16,16,0,0,0,8,112v32a16,16,0,0,0,16,16H56a16,16,0,0,0,16-16v-8h32v32a24,24,0,0,0,24,24h16v16a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V160a16,16,0,0,0-16-16H160a16,16,0,0,0-16,16v16H128a8,8,0,0,1-8-8V88a8,8,0,0,1,8-8h16V96A16,16,0,0,0,160,112ZM56,144H24V112H56v32Zm104,16h48v48H160Zm0-112h48V96H160Z'></path>
    </BaseIcon>
)
Graph.displayName = 'Graph'

export const User: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' />
        <circle cx='12' cy='7' r='4' />
    </BaseIcon>
)
User.displayName = 'User'

export const Settings: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' />
        <circle cx='12' cy='12' r='3' />
    </BaseIcon>
)
Settings.displayName = 'Settings'

export const TableOfContents: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M16 5H3' />
        <path d='M16 12H3' />
        <path d='M16 19H3' />
        <path d='M21 5h.01' />
        <path d='M21 12h.01' />
        <path d='M21 19h.01' />
    </BaseIcon>
)
TableOfContents.displayName = 'TableOfContents'

LogOut.displayName = 'LogOut'

export const Lambda: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M6 20l6.5 -9' />
        <path d='M19 20c-6 0 -6 -16 -12 -16' />
    </BaseIcon>
)
Lambda.displayName = 'Lambda'

export const MathFunction: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M3 19a2 2 0 0 0 2 2c2 0 2 -4 3 -9s1 -9 3 -9a2 2 0 0 1 2 2' />
        <path d='M5 12h6' />
        <path d='M15 12l6 6' />
        <path d='M15 18l6 -6' />
    </BaseIcon>
)
MathFunction.displayName = 'MathFunction'

export const AdjustmentsHorizontal: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0' />
        <path d='M4 6l8 0' />
        <path d='M16 6l4 0' />
        <path d='M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0' />
        <path d='M4 12l2 0' />
        <path d='M10 12l10 0' />
        <path d='M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0' />
        <path d='M4 18l11 0' />
        <path d='M19 18l1 0' />
    </BaseIcon>
)
AdjustmentsHorizontal.displayName = 'AdjustmentsHorizontal'

export const ToggleRight: React.FC<BaseIconProps> = (props) => (
    <BaseIcon viewBox='0 0 15 15' size={15} fill='currentColor' stroke='none' {...props}>
        <path
            d='M7.67133 11C6.65183 10.175 6 8.91363 6 7.5C6 6.08637 6.65183 4.82498 7.67133 4H4.5C2.567 4 1 5.567 1 7.5C1 9.433 2.567 11 4.5 11H7.67133ZM0 7.5C0 5.01472 2.01472 3 4.5 3H10.5C12.9853 3 15 5.01472 15 7.5C15 9.98528 12.9853 12 10.5 12H4.5C2.01472 12 0 9.98528 0 7.5Z'
            fillRule='evenodd'
            clipRule='evenodd'
        />
        <circle cx='10.5' cy='7.5' r='3.5' />
    </BaseIcon>
)
ToggleRight.displayName = 'ToggleRight'

export const Users: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
        <path d='M16 3.128a4 4 0 0 1 0 7.744' />
        <path d='M22 21v-2a4 4 0 0 0-3-3.87' />
        <circle cx='9' cy='7' r='4' />
    </BaseIcon>
)
Users.displayName = 'Users'

export const Video: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5' />
        <rect x='2' y='6' width='14' height='12' rx='2' />
    </BaseIcon>
)
Video.displayName = 'Video'

export const Videotape: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <rect width='20' height='16' x='2' y='4' rx='2' />
        <path d='M2 8h20' />
        <circle cx='8' cy='14' r='2' />
        <path d='M8 12h8' />
        <circle cx='16' cy='14' r='2' />
    </BaseIcon>
)
Videotape.displayName = 'Videotape'

export const DiscAlbum: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <rect width='18' height='18' x='3' y='3' rx='2' />
        <circle cx='12' cy='12' r='5' />
        <path d='M12 12h.01' />
    </BaseIcon>
)
DiscAlbum.displayName = 'DiscAlbum'

export const Disc3: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='12' cy='12' r='10' />
        <path d='M6 12c0-1.7.7-3.2 1.8-4.2' />
        <circle cx='12' cy='12' r='2' />
        <path d='M18 12c0 1.7-.7 3.2-1.8 4.2' />
    </BaseIcon>
)
Disc3.displayName = 'Disc3'

export const Voicemail: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <circle cx='6' cy='12' r='4' />
        <circle cx='18' cy='12' r='4' />
        <line x1='6' x2='18' y1='16' y2='16' />
    </BaseIcon>
)
Voicemail.displayName = 'Voicemail'

export const Clapperboard: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m12.296 3.464 3.02 3.956' />
        <path d='M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z' />
        <path d='M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' />
        <path d='m6.18 5.276 3.1 3.899' />
    </BaseIcon>
)
Clapperboard.displayName = 'Clapperboard'

export const Film: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <rect width='18' height='18' x='3' y='3' rx='2' />
        <path d='M7 3v18' />
        <path d='M3 7.5h4' />
        <path d='M3 12h18' />
        <path d='M3 16.5h4' />
        <path d='M17 3v18' />
        <path d='M17 7.5h4' />
        <path d='M17 16.5h4' />
    </BaseIcon>
)
Film.displayName = 'Film'

export const Zap: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path
            fill='currentColor'
            stroke='none'
            d='M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'
        />
    </BaseIcon>
)
Zap.displayName = 'Zap'

export const TimerReset: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M10 2h4' />
        <path d='M12 14v-4' />
        <path d='M4 13a8 8 0 0 1 8-7 8 8 0 1 1-5.3 14L4 17.6' />
        <path d='M9 17H4v5' />
    </BaseIcon>
)
TimerReset.displayName = 'TimerReset'

export const Timer: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <line x1='10' x2='14' y1='2' y2='2' />
        <line x1='12' x2='15' y1='14' y2='11' />
        <circle cx='12' cy='14' r='8' />
    </BaseIcon>
)
Timer.displayName = 'Timer'

export const Shield: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' />
    </BaseIcon>
)
Shield.displayName = 'Shield'

export const ShieldCheck: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' />
        <path d='m9 12 2 2 4-4' />
    </BaseIcon>
)
ShieldCheck.displayName = 'ShieldCheck'

export const BookCheck: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20' />
        <path d='m9 9.5 2 2 4-4' />
    </BaseIcon>
)
BookCheck.displayName = 'BookCheck'

export const DraftingCompass: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m12.99 6.74 1.93 3.44' />
        <path d='M19.136 12a10 10 0 0 1-14.271 0' />
        <path d='m21 21-2.16-3.84' />
        <path d='m3 21 8.02-14.26' />
        <circle cx='12' cy='5' r='2' />
    </BaseIcon>
)
DraftingCompass.displayName = 'DraftingCompass'

export const ExternalLink: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M15 3h6v6' />
        <path d='M10 14 21 3' />
        <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
    </BaseIcon>
)
ExternalLink.displayName = 'ExternalLink'

export const Link: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' />
        <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' />
    </BaseIcon>
)
Link.displayName = 'Link'

export const Unlink: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71' />
        <path d='m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71' />
        <line x1='8' x2='8' y1='2' y2='5' />
        <line x1='2' x2='5' y1='8' y2='8' />
        <line x1='16' x2='16' y1='19' y2='22' />
        <line x1='19' x2='22' y1='16' y2='16' />
    </BaseIcon>
)
Unlink.displayName = 'Unlink'

export const SlidersHorizontal: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M10 5H3' />
        <path d='M12 19H3' />
        <path d='M14 3v4' />
        <path d='M16 17v4' />
        <path d='M21 12h-9' />
        <path d='M21 19h-5' />
        <path d='M21 5h-7' />
        <path d='M8 10v4' />
        <path d='M8 12H3' />
    </BaseIcon>
)
SlidersHorizontal.displayName = 'SlidersHorizontal'

export const Cog: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M11 10.27 7 3.34' />
        <path d='m11 13.73-4 6.93' />
        <path d='M12 22v-2' />
        <path d='M12 2v2' />
        <path d='M14 12h8' />
        <path d='m17 20.66-1-1.73' />
        <path d='m17 3.34-1 1.73' />
        <path d='M2 12h2' />
        <path d='m20.66 17-1.73-1' />
        <path d='m20.66 7-1.73 1' />
        <path d='m3.34 17 1.73-1' />
        <path d='m3.34 7 1.73 1' />
        <circle cx='12' cy='12' r='2' />
        <circle cx='12' cy='12' r='8' />
    </BaseIcon>
)
Cog.displayName = 'Cog'

export const Bug: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M12 20v-9' />
        <path d='M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z' />
        <path d='M14.12 3.88 16 2' />
        <path d='M21 21a4 4 0 0 0-3.81-4' />
        <path d='M21 5a4 4 0 0 1-3.55 3.97' />
        <path d='M22 13h-4' />
        <path d='M3 21a4 4 0 0 1 3.81-4' />
        <path d='M3 5a4 4 0 0 0 3.55 3.97' />
        <path d='M6 13H2' />
        <path d='m8 2 1.88 1.88' />
        <path d='M9 7.13V6a3 3 0 1 1 6 0v1.13' />
    </BaseIcon>
)
Bug.displayName = 'Bug'

export const ShieldAlert: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' />
        <path d='M12 8v4' />
        <path d='M12 16h.01' />
    </BaseIcon>
)
ShieldAlert.displayName = 'ShieldAlert'

export const ShieldQuestionMark: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' />
        <path d='M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3' />
        <path d='M12 17h.01' />
    </BaseIcon>
)
ShieldQuestionMark.displayName = 'ShieldQuestionMark'

export const MessageCircleQuestionMark: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719' />
        <path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' />
        <path d='M12 17h.01' />
    </BaseIcon>
)
MessageCircleQuestionMark.displayName = 'MessageCircleQuestionMark'

export const ShieldUser: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' />
        <path d='M6.376 18.91a6 6 0 0 1 11.249.003' />
        <circle cx='12' cy='11' r='4' />
    </BaseIcon>
)
ShieldUser.displayName = 'ShieldUser'

export const SearchCode: React.FC<BaseIconProps> = (props) => (
    <BaseIcon strokeWidth={2} {...props}>
        <path d='m13 13.5 2-2.5-2-2.5' />
        <path d='m21 21-4.3-4.3' />
        <path d='M9 8.5 7 11l2 2.5' />
        <circle cx='11' cy='11' r='8' />
    </BaseIcon>
)
SearchCode.displayName = 'SearchCode'
export const Server: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <rect width='20' height='8' x='2' y='2' rx='2' ry='2' />
        <rect width='20' height='8' x='2' y='14' rx='2' ry='2' />
        <line x1='6' x2='6.01' y1='6' y2='6' />
        <line x1='6' x2='6.01' y1='18' y2='18' />
    </BaseIcon>
)
Server.displayName = 'Server'

export const Cpu: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M12 20v2' />
        <path d='M12 2v2' />
        <path d='M17 20v2' />
        <path d='M17 2v2' />
        <path d='M2 12h2' />
        <path d='M2 17h2' />
        <path d='M2 7h2' />
        <path d='M20 12h2' />
        <path d='M20 17h2' />
        <path d='M20 7h2' />
        <path d='M7 20v2' />
        <path d='M7 2v2' />
        <rect x='4' y='4' width='16' height='16' rx='2' />
        <rect x='8' y='8' width='8' height='8' rx='1' />
    </BaseIcon>
)
Cpu.displayName = 'Cpu'

export const Database: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <ellipse cx='12' cy='5' rx='9' ry='3' />
        <path d='M3 5V19A9 3 0 0 0 21 19V5' />
        <path d='M3 12A9 3 0 0 0 21 12' />
    </BaseIcon>
)
Database.displayName = 'Database'

export const ChartNoAxesCombined: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M12 16v5' />
        <path d='M16 14.639V21' />
        <path d='M20 10.656V21' />
        <path d='m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15' />
        <path d='M4 18.463V21' />
        <path d='M8 14.656V21' />
    </BaseIcon>
)
ChartNoAxesCombined.displayName = 'ChartNoAxesCombined'

export const Receipt: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='M12 17V7' />
        <path d='M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8' />
        <path d='M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z' />
    </BaseIcon>
)
Receipt.displayName = 'Receipt'

export const Code: React.FC<BaseIconProps> = (props) => (
    <BaseIcon {...props}>
        <path d='m16 18 6-6-6-6' />
        <path d='m8 6-6 6 6 6' />
    </BaseIcon>
)
Code.displayName = 'Code'
