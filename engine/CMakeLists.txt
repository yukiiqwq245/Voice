cmake_minimum_required(VERSION 3.20)
project(PitcheeWebEngine LANGUAGES C CXX)

if(NOT NCNN_ROOT)
    message(FATAL_ERROR "Set NCNN_ROOT to the x64 directory of the Windows ncnn SDK")
endif()
find_path(NCNN_INCLUDE ncnn/net.h HINTS "${NCNN_ROOT}/include" REQUIRED NO_DEFAULT_PATH)
find_library(NCNN_LIBRARY NAMES ncnn HINTS "${NCNN_ROOT}/lib" REQUIRED NO_DEFAULT_PATH)
set(CORE "${CMAKE_CURRENT_LIST_DIR}/../core")
add_executable(pitchee_cli
    "${CORE}/pitchee_cli.cpp"
    "${CORE}/src/analyzer.cpp"
    "${CORE}/src/audio.cpp"
    "${CORE}/src/hnr.cpp"
    "${CORE}/src/json.cpp"
    "${CORE}/src/naturalness.cpp"
    "${CORE}/src/model_runtime.cpp"
    "${CORE}/src/ncnn_pitchee_layers.cpp"
    "${CORE}/src/scoring.cpp"
    "${CORE}/src/spectrum.cpp"
    "${CORE}/src/vad.cpp"
    "${CORE}/src/voice_health.cpp"
    "${CORE}/src/wav_reader.cpp"
)
target_compile_features(pitchee_cli PRIVATE cxx_std_17)
target_compile_definitions(pitchee_cli PRIVATE PITCHEE_ENABLE_NCNN=1 PITCHEE_STATIC=1 PITCHEE_CORE_BUILD=1)
target_include_directories(pitchee_cli PRIVATE "${CORE}/include" "${CORE}/src" "${NCNN_INCLUDE}")
target_link_libraries(pitchee_cli PRIVATE "${NCNN_LIBRARY}")
if(MSVC)
    target_compile_options(pitchee_cli PRIVATE /utf-8 /EHsc)
endif()
