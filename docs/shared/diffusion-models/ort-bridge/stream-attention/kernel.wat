(module
  (type (;0;) (func (param f32) (result i32)))
  (type (;1;) (func (param i32 i32) (result i32)))
  (type (;2;) (func (param i32 i32 i32 i32 i32 f32 f32) (result f32)))
  (type (;3;) (func (param i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type (;4;) (func (param i32 i32 i32 i32) (result i32)))
  (func (;0;) (type 0) (param f32) (result i32)
    (local i32 i32 f32 f32 i32 f32 f32 f32 f32 i32 i32 i32 i32)
    global.get 0
    local.set 13
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 12
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 9 (;@1;)
                      end
                      global.get 0
                      local.set 1
                      global.get 0
                      i32.const 4
                      i32.add
                      global.set 0
                      local.get 1
                      local.get 0
                      f32.store
                      global.get 0
                      local.set 2
                      global.get 0
                      i32.const 1
                      i32.add
                      global.set 0
                      local.get 2
                      i32.const 0
                      i32.store8
                      local.get 1
                      f32.load
                      local.set 3
                      local.get 1
                      f32.load
                      local.set 4
                      local.get 3
                      local.get 4
                      f32.eq
                      local.set 5
                      local.get 5
                      if  ;; label = @10
                        i32.const 3
                        local.set 12
                        br 8 (;@2;)
                      else
                        i32.const 4
                        local.set 12
                        br 8 (;@2;)
                      end
                    end
                    local.get 13
                    global.set 0
                    i32.const 0
                    return
                  end
                  i32.const 7
                  local.set 12
                  br 5 (;@2;)
                end
                local.get 1
                f32.load
                local.set 6
                local.get 1
                f32.load
                local.set 7
                local.get 6
                local.get 7
                f32.sub
                local.set 8
                i32.const 0
                f32.convert_i32_s
                local.set 9
                local.get 8
                local.get 9
                f32.eq
                local.set 10
                local.get 2
                local.get 10
                i32.store8
                i32.const 5
                local.set 12
                br 4 (;@2;)
              end
              i32.const 5
              local.set 12
              br 3 (;@2;)
            end
            local.get 2
            i32.load8_u
            local.set 11
            local.get 13
            global.set 0
            local.get 11
            return
          end
          i32.const 2
          local.set 12
          br 1 (;@2;)
        end
        i32.const 1
        local.set 12
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;1;) (type 1) (param i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 17
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    local.get 16
                                                    br_table 0 (;@24;) 1 (;@23;) 2 (;@22;) 3 (;@21;) 4 (;@20;) 5 (;@19;) 6 (;@18;) 7 (;@17;) 8 (;@16;) 9 (;@15;) 10 (;@14;) 11 (;@13;) 12 (;@12;) 13 (;@11;) 14 (;@10;) 15 (;@9;) 16 (;@8;) 17 (;@7;) 18 (;@6;) 19 (;@5;) 20 (;@4;) 21 (;@3;) 23 (;@1;)
                                                  end
                                                  global.get 0
                                                  local.set 2
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 2
                                                  local.get 0
                                                  i32.store
                                                  global.get 0
                                                  local.set 3
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 3
                                                  local.get 1
                                                  i32.store
                                                  global.get 0
                                                  local.set 4
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 4
                                                  i32.const 0
                                                  i32.store
                                                  i32.const 4
                                                  local.set 16
                                                  br 21 (;@2;)
                                                end
                                                local.get 17
                                                global.set 0
                                                i32.const 0
                                                return
                                              end
                                              local.get 17
                                              global.set 0
                                              i32.const 1
                                              return
                                            end
                                            i32.const 2
                                            local.set 16
                                            br 18 (;@2;)
                                          end
                                          local.get 4
                                          i32.load
                                          local.set 5
                                          local.get 3
                                          i32.load
                                          local.set 6
                                          local.get 5
                                          local.get 6
                                          i32.lt_s
                                          local.set 7
                                          local.get 7
                                          if  ;; label = @20
                                            i32.const 8
                                            local.set 16
                                            br 18 (;@2;)
                                          else
                                            i32.const 9
                                            local.set 16
                                            br 18 (;@2;)
                                          end
                                        end
                                        i32.const 3
                                        local.set 16
                                        br 16 (;@2;)
                                      end
                                      i32.const 4
                                      local.set 16
                                      br 15 (;@2;)
                                    end
                                    i32.const 6
                                    local.set 16
                                    br 14 (;@2;)
                                  end
                                  local.get 2
                                  i32.load
                                  local.set 8
                                  local.get 4
                                  i32.load
                                  local.set 9
                                  local.get 8
                                  local.get 9
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 10
                                  local.get 10
                                  f32.load
                                  local.set 11
                                  local.get 11
                                  call 0
                                  local.set 12
                                  local.get 12
                                  i32.eqz
                                  local.set 13
                                  local.get 13
                                  if  ;; label = @16
                                    i32.const 12
                                    local.set 16
                                    br 14 (;@2;)
                                  else
                                    i32.const 13
                                    local.set 16
                                    br 14 (;@2;)
                                  end
                                end
                                i32.const 3
                                local.set 16
                                br 12 (;@2;)
                              end
                              i32.const 7
                              local.set 16
                              br 11 (;@2;)
                            end
                            local.get 4
                            i32.load
                            local.set 14
                            local.get 14
                            i32.const 1
                            i32.add
                            local.set 15
                            local.get 4
                            local.get 15
                            i32.store
                            i32.const 16
                            local.set 16
                            br 10 (;@2;)
                          end
                          local.get 17
                          global.set 0
                          i32.const 0
                          return
                        end
                        i32.const 14
                        local.set 16
                        br 8 (;@2;)
                      end
                      i32.const 11
                      local.set 16
                      br 7 (;@2;)
                    end
                    i32.const 14
                    local.set 16
                    br 6 (;@2;)
                  end
                  i32.const 10
                  local.set 16
                  br 5 (;@2;)
                end
                i32.const 10
                local.set 16
                br 4 (;@2;)
              end
              i32.const 4
              local.set 16
              br 3 (;@2;)
            end
            i32.const 21
            local.set 16
            br 2 (;@2;)
          end
          i32.const 19
          local.set 16
          br 1 (;@2;)
        end
        i32.const 1
        local.set 16
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;2;) (type 1) (param i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 f32 f32 i32 i32 i32 i32)
    global.get 0
    local.set 33
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                local.get 32
                                                                br_table 0 (;@30;) 1 (;@29;) 2 (;@28;) 3 (;@27;) 4 (;@26;) 5 (;@25;) 6 (;@24;) 7 (;@23;) 8 (;@22;) 9 (;@21;) 10 (;@20;) 11 (;@19;) 12 (;@18;) 13 (;@17;) 14 (;@16;) 15 (;@15;) 16 (;@14;) 17 (;@13;) 18 (;@12;) 19 (;@11;) 20 (;@10;) 21 (;@9;) 22 (;@8;) 23 (;@7;) 24 (;@6;) 25 (;@5;) 26 (;@4;) 27 (;@3;) 29 (;@1;)
                                                              end
                                                              global.get 0
                                                              local.set 2
                                                              global.get 0
                                                              i32.const 4
                                                              i32.add
                                                              global.set 0
                                                              local.get 2
                                                              local.get 0
                                                              i32.store
                                                              global.get 0
                                                              local.set 3
                                                              global.get 0
                                                              i32.const 4
                                                              i32.add
                                                              global.set 0
                                                              local.get 3
                                                              local.get 1
                                                              i32.store
                                                              global.get 0
                                                              local.set 4
                                                              global.get 0
                                                              i32.const 4
                                                              i32.add
                                                              global.set 0
                                                              local.get 4
                                                              i32.const 0
                                                              i32.store
                                                              i32.const 4
                                                              local.set 32
                                                              br 27 (;@2;)
                                                            end
                                                            local.get 33
                                                            global.set 0
                                                            i32.const 0
                                                            return
                                                          end
                                                          local.get 33
                                                          global.set 0
                                                          i32.const 1
                                                          return
                                                        end
                                                        i32.const 2
                                                        local.set 32
                                                        br 24 (;@2;)
                                                      end
                                                      local.get 4
                                                      i32.load
                                                      local.set 5
                                                      local.get 3
                                                      i32.load
                                                      local.set 6
                                                      local.get 5
                                                      local.get 6
                                                      i32.lt_s
                                                      local.set 7
                                                      local.get 7
                                                      if  ;; label = @26
                                                        i32.const 8
                                                        local.set 32
                                                        br 24 (;@2;)
                                                      else
                                                        i32.const 9
                                                        local.set 32
                                                        br 24 (;@2;)
                                                      end
                                                    end
                                                    i32.const 3
                                                    local.set 32
                                                    br 22 (;@2;)
                                                  end
                                                  i32.const 4
                                                  local.set 32
                                                  br 21 (;@2;)
                                                end
                                                i32.const 6
                                                local.set 32
                                                br 20 (;@2;)
                                              end
                                              global.get 0
                                              local.set 8
                                              global.get 0
                                              i32.const 1
                                              i32.add
                                              global.set 0
                                              local.get 8
                                              i32.const 1
                                              i32.store8
                                              global.get 0
                                              local.set 9
                                              global.get 0
                                              i32.const 1
                                              i32.add
                                              global.set 0
                                              local.get 9
                                              i32.const 1
                                              i32.store8
                                              local.get 2
                                              i32.load
                                              local.set 10
                                              local.get 4
                                              i32.load
                                              local.set 11
                                              local.get 10
                                              local.get 11
                                              i32.const 4
                                              i32.mul
                                              i32.add
                                              local.set 12
                                              local.get 12
                                              f32.load
                                              local.set 13
                                              local.get 13
                                              call 0
                                              local.set 14
                                              local.get 14
                                              i32.eqz
                                              local.set 15
                                              local.get 15
                                              if  ;; label = @22
                                                i32.const 12
                                                local.set 32
                                                br 20 (;@2;)
                                              else
                                                i32.const 13
                                                local.set 32
                                                br 20 (;@2;)
                                              end
                                            end
                                            i32.const 3
                                            local.set 32
                                            br 18 (;@2;)
                                          end
                                          i32.const 7
                                          local.set 32
                                          br 17 (;@2;)
                                        end
                                        local.get 4
                                        i32.load
                                        local.set 16
                                        local.get 16
                                        i32.const 1
                                        i32.add
                                        local.set 17
                                        local.get 4
                                        local.get 17
                                        i32.store
                                        i32.const 22
                                        local.set 32
                                        br 16 (;@2;)
                                      end
                                      i32.const 14
                                      local.set 32
                                      br 15 (;@2;)
                                    end
                                    local.get 2
                                    i32.load
                                    local.set 18
                                    local.get 4
                                    i32.load
                                    local.set 19
                                    local.get 18
                                    local.get 19
                                    i32.const 4
                                    i32.mul
                                    i32.add
                                    local.set 20
                                    local.get 20
                                    f32.load
                                    local.set 21
                                    i32.const 0
                                    f32.convert_i32_s
                                    local.set 22
                                    local.get 21
                                    local.get 22
                                    f32.lt
                                    local.set 23
                                    local.get 9
                                    local.get 23
                                    i32.store8
                                    i32.const 14
                                    local.set 32
                                    br 14 (;@2;)
                                  end
                                  local.get 9
                                  i32.load8_u
                                  local.set 24
                                  local.get 24
                                  if  ;; label = @16
                                    i32.const 15
                                    local.set 32
                                    br 14 (;@2;)
                                  else
                                    i32.const 16
                                    local.set 32
                                    br 14 (;@2;)
                                  end
                                end
                                i32.const 17
                                local.set 32
                                br 12 (;@2;)
                              end
                              local.get 2
                              i32.load
                              local.set 25
                              local.get 4
                              i32.load
                              local.set 26
                              local.get 25
                              local.get 26
                              i32.const 4
                              i32.mul
                              i32.add
                              local.set 27
                              local.get 27
                              f32.load
                              local.set 28
                              i32.const 1
                              f32.convert_i32_s
                              local.set 29
                              local.get 28
                              local.get 29
                              f32.gt
                              local.set 30
                              local.get 8
                              local.get 30
                              i32.store8
                              i32.const 17
                              local.set 32
                              br 11 (;@2;)
                            end
                            local.get 8
                            i32.load8_u
                            local.set 31
                            local.get 31
                            if  ;; label = @13
                              i32.const 18
                              local.set 32
                              br 11 (;@2;)
                            else
                              i32.const 19
                              local.set 32
                              br 11 (;@2;)
                            end
                          end
                          local.get 33
                          global.set 0
                          i32.const 0
                          return
                        end
                        i32.const 20
                        local.set 32
                        br 8 (;@2;)
                      end
                      i32.const 11
                      local.set 32
                      br 7 (;@2;)
                    end
                    i32.const 20
                    local.set 32
                    br 6 (;@2;)
                  end
                  i32.const 10
                  local.set 32
                  br 5 (;@2;)
                end
                i32.const 10
                local.set 32
                br 4 (;@2;)
              end
              i32.const 4
              local.set 32
              br 3 (;@2;)
            end
            i32.const 27
            local.set 32
            br 2 (;@2;)
          end
          i32.const 25
          local.set 32
          br 1 (;@2;)
        end
        i32.const 1
        local.set 32
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;3;) (type 2) (param i32 i32 i32 i32 i32 f32 f32) (result f32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 87
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    local.get 86
                                                                                    br_table 0 (;@40;) 1 (;@39;) 2 (;@38;) 3 (;@37;) 4 (;@36;) 5 (;@35;) 6 (;@34;) 7 (;@33;) 8 (;@32;) 9 (;@31;) 10 (;@30;) 11 (;@29;) 12 (;@28;) 13 (;@27;) 14 (;@26;) 15 (;@25;) 16 (;@24;) 17 (;@23;) 18 (;@22;) 19 (;@21;) 20 (;@20;) 21 (;@19;) 22 (;@18;) 23 (;@17;) 24 (;@16;) 25 (;@15;) 26 (;@14;) 27 (;@13;) 28 (;@12;) 29 (;@11;) 30 (;@10;) 31 (;@9;) 32 (;@8;) 33 (;@7;) 34 (;@6;) 35 (;@5;) 36 (;@4;) 37 (;@3;) 39 (;@1;)
                                                                                  end
                                                                                  global.get 0
                                                                                  local.set 7
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 7
                                                                                  local.get 0
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 8
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 8
                                                                                  local.get 1
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 9
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 9
                                                                                  local.get 2
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 10
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 10
                                                                                  local.get 3
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 11
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 11
                                                                                  local.get 4
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 12
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 12
                                                                                  local.get 5
                                                                                  f32.store
                                                                                  global.get 0
                                                                                  local.set 13
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 13
                                                                                  local.get 6
                                                                                  f32.store
                                                                                  global.get 0
                                                                                  local.set 14
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 14
                                                                                  i32.const 0
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 15
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 15
                                                                                  i32.const 0
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 16
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 16
                                                                                  i32.const 0
                                                                                  i32.store
                                                                                  i32.const 0
                                                                                  f32.convert_i32_s
                                                                                  local.set 17
                                                                                  global.get 0
                                                                                  local.set 18
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 18
                                                                                  local.get 17
                                                                                  f32.store
                                                                                  local.get 13
                                                                                  f32.load
                                                                                  local.set 19
                                                                                  local.get 12
                                                                                  f32.load
                                                                                  local.set 20
                                                                                  local.get 19
                                                                                  local.get 20
                                                                                  f32.mul
                                                                                  local.set 21
                                                                                  global.get 0
                                                                                  local.set 22
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 22
                                                                                  local.get 21
                                                                                  f32.store
                                                                                  i32.const 4
                                                                                  local.set 86
                                                                                  br 37 (;@2;)
                                                                                end
                                                                                local.get 87
                                                                                global.set 0
                                                                                f32.const 0x0p+0 (;=0;)
                                                                                return
                                                                              end
                                                                              i32.const 14
                                                                              local.set 86
                                                                              br 35 (;@2;)
                                                                            end
                                                                            i32.const 2
                                                                            local.set 86
                                                                            br 34 (;@2;)
                                                                          end
                                                                          local.get 14
                                                                          i32.load
                                                                          local.set 23
                                                                          local.get 23
                                                                          i32.const 128
                                                                          i32.lt_s
                                                                          local.set 24
                                                                          local.get 24
                                                                          if  ;; label = @36
                                                                            i32.const 8
                                                                            local.set 86
                                                                            br 34 (;@2;)
                                                                          else
                                                                            i32.const 9
                                                                            local.set 86
                                                                            br 34 (;@2;)
                                                                          end
                                                                        end
                                                                        i32.const 3
                                                                        local.set 86
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 4
                                                                      local.set 86
                                                                      br 31 (;@2;)
                                                                    end
                                                                    i32.const 6
                                                                    local.set 86
                                                                    br 30 (;@2;)
                                                                  end
                                                                  local.get 10
                                                                  i32.load
                                                                  local.set 25
                                                                  local.get 25
                                                                  i32.const 128
                                                                  i32.mul
                                                                  local.set 26
                                                                  local.get 14
                                                                  i32.load
                                                                  local.set 27
                                                                  local.get 26
                                                                  local.get 27
                                                                  i32.add
                                                                  local.set 28
                                                                  local.get 16
                                                                  local.get 28
                                                                  i32.store
                                                                  local.get 9
                                                                  i32.load
                                                                  local.set 29
                                                                  local.get 16
                                                                  i32.load
                                                                  local.set 30
                                                                  local.get 29
                                                                  local.get 30
                                                                  i32.const 4
                                                                  i32.mul
                                                                  i32.add
                                                                  local.set 31
                                                                  local.get 31
                                                                  f32.load
                                                                  local.set 32
                                                                  local.get 12
                                                                  f32.load
                                                                  local.set 33
                                                                  local.get 32
                                                                  local.get 33
                                                                  f32.mul
                                                                  local.set 34
                                                                  local.get 9
                                                                  i32.load
                                                                  local.set 35
                                                                  local.get 9
                                                                  i32.load
                                                                  local.set 36
                                                                  local.get 16
                                                                  i32.load
                                                                  local.set 37
                                                                  local.get 9
                                                                  i32.load
                                                                  local.set 38
                                                                  local.get 38
                                                                  local.get 37
                                                                  i32.const 4
                                                                  i32.mul
                                                                  i32.add
                                                                  local.set 39
                                                                  local.get 39
                                                                  local.get 34
                                                                  f32.store
                                                                  local.get 14
                                                                  i32.load
                                                                  local.set 40
                                                                  local.get 40
                                                                  i32.const 1
                                                                  i32.add
                                                                  local.set 41
                                                                  local.get 14
                                                                  local.get 41
                                                                  i32.store
                                                                  i32.const 10
                                                                  local.set 86
                                                                  br 29 (;@2;)
                                                                end
                                                                i32.const 3
                                                                local.set 86
                                                                br 28 (;@2;)
                                                              end
                                                              i32.const 7
                                                              local.set 86
                                                              br 27 (;@2;)
                                                            end
                                                            i32.const 10
                                                            local.set 86
                                                            br 26 (;@2;)
                                                          end
                                                          i32.const 4
                                                          local.set 86
                                                          br 25 (;@2;)
                                                        end
                                                        local.get 22
                                                        f32.load
                                                        local.set 42
                                                        local.get 87
                                                        global.set 0
                                                        local.get 42
                                                        return
                                                      end
                                                      local.get 15
                                                      i32.load
                                                      local.set 43
                                                      local.get 11
                                                      i32.load
                                                      local.set 44
                                                      local.get 43
                                                      local.get 44
                                                      i32.lt_s
                                                      local.set 45
                                                      local.get 45
                                                      if  ;; label = @26
                                                        i32.const 18
                                                        local.set 86
                                                        br 24 (;@2;)
                                                      else
                                                        i32.const 19
                                                        local.set 86
                                                        br 24 (;@2;)
                                                      end
                                                    end
                                                    i32.const 13
                                                    local.set 86
                                                    br 22 (;@2;)
                                                  end
                                                  i32.const 14
                                                  local.set 86
                                                  br 21 (;@2;)
                                                end
                                                i32.const 16
                                                local.set 86
                                                br 20 (;@2;)
                                              end
                                              local.get 7
                                              i32.load
                                              local.set 46
                                              local.get 10
                                              i32.load
                                              local.set 47
                                              local.get 11
                                              i32.load
                                              local.set 48
                                              local.get 47
                                              local.get 48
                                              i32.mul
                                              local.set 49
                                              local.get 15
                                              i32.load
                                              local.set 50
                                              local.get 49
                                              local.get 50
                                              i32.add
                                              local.set 51
                                              local.get 46
                                              local.get 51
                                              i32.const 4
                                              i32.mul
                                              i32.add
                                              local.set 52
                                              local.get 52
                                              f32.load
                                              local.set 53
                                              local.get 18
                                              local.get 53
                                              f32.store
                                              local.get 22
                                              f32.load
                                              local.set 54
                                              local.get 18
                                              f32.load
                                              local.set 55
                                              local.get 54
                                              local.get 55
                                              f32.add
                                              local.set 56
                                              local.get 22
                                              local.get 56
                                              f32.store
                                              local.get 14
                                              i32.const 0
                                              i32.store
                                              i32.const 23
                                              local.set 86
                                              br 19 (;@2;)
                                            end
                                            i32.const 13
                                            local.set 86
                                            br 18 (;@2;)
                                          end
                                          i32.const 17
                                          local.set 86
                                          br 17 (;@2;)
                                        end
                                        local.get 15
                                        i32.load
                                        local.set 57
                                        local.get 57
                                        i32.const 1
                                        i32.add
                                        local.set 58
                                        local.get 15
                                        local.get 58
                                        i32.store
                                        i32.const 32
                                        local.set 86
                                        br 16 (;@2;)
                                      end
                                      i32.const 21
                                      local.set 86
                                      br 15 (;@2;)
                                    end
                                    local.get 14
                                    i32.load
                                    local.set 59
                                    local.get 59
                                    i32.const 128
                                    i32.lt_s
                                    local.set 60
                                    local.get 60
                                    if  ;; label = @17
                                      i32.const 27
                                      local.set 86
                                      br 15 (;@2;)
                                    else
                                      i32.const 28
                                      local.set 86
                                      br 15 (;@2;)
                                    end
                                  end
                                  i32.const 22
                                  local.set 86
                                  br 13 (;@2;)
                                end
                                i32.const 23
                                local.set 86
                                br 12 (;@2;)
                              end
                              i32.const 25
                              local.set 86
                              br 11 (;@2;)
                            end
                            local.get 10
                            i32.load
                            local.set 61
                            local.get 61
                            i32.const 128
                            i32.mul
                            local.set 62
                            local.get 14
                            i32.load
                            local.set 63
                            local.get 62
                            local.get 63
                            i32.add
                            local.set 64
                            local.get 16
                            local.get 64
                            i32.store
                            local.get 9
                            i32.load
                            local.set 65
                            local.get 16
                            i32.load
                            local.set 66
                            local.get 65
                            local.get 66
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 67
                            local.get 67
                            f32.load
                            local.set 68
                            local.get 18
                            f32.load
                            local.set 69
                            local.get 8
                            i32.load
                            local.set 70
                            local.get 15
                            i32.load
                            local.set 71
                            local.get 71
                            i32.const 128
                            i32.mul
                            local.set 72
                            local.get 14
                            i32.load
                            local.set 73
                            local.get 72
                            local.get 73
                            i32.add
                            local.set 74
                            local.get 70
                            local.get 74
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 75
                            local.get 75
                            f32.load
                            local.set 76
                            local.get 69
                            local.get 76
                            f32.mul
                            local.set 77
                            local.get 68
                            local.get 77
                            f32.add
                            local.set 78
                            local.get 9
                            i32.load
                            local.set 79
                            local.get 9
                            i32.load
                            local.set 80
                            local.get 16
                            i32.load
                            local.set 81
                            local.get 9
                            i32.load
                            local.set 82
                            local.get 82
                            local.get 81
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 83
                            local.get 83
                            local.get 78
                            f32.store
                            local.get 14
                            i32.load
                            local.set 84
                            local.get 84
                            i32.const 1
                            i32.add
                            local.set 85
                            local.get 14
                            local.get 85
                            i32.store
                            i32.const 29
                            local.set 86
                            br 10 (;@2;)
                          end
                          i32.const 22
                          local.set 86
                          br 9 (;@2;)
                        end
                        i32.const 26
                        local.set 86
                        br 8 (;@2;)
                      end
                      i32.const 29
                      local.set 86
                      br 7 (;@2;)
                    end
                    i32.const 23
                    local.set 86
                    br 6 (;@2;)
                  end
                  i32.const 20
                  local.set 86
                  br 5 (;@2;)
                end
                i32.const 20
                local.set 86
                br 4 (;@2;)
              end
              i32.const 14
              local.set 86
              br 3 (;@2;)
            end
            i32.const 37
            local.set 86
            br 2 (;@2;)
          end
          i32.const 35
          local.set 86
          br 1 (;@2;)
        end
        i32.const 1
        local.set 86
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;4;) (type 3) (param i32 i32 i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 f32 f32 i32 f32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 93
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            block  ;; label = @53
                                                                                                              block  ;; label = @54
                                                                                                                block  ;; label = @55
                                                                                                                  block  ;; label = @56
                                                                                                                    block  ;; label = @57
                                                                                                                      local.get 92
                                                                                                                      br_table 0 (;@57;) 1 (;@56;) 2 (;@55;) 3 (;@54;) 4 (;@53;) 5 (;@52;) 6 (;@51;) 7 (;@50;) 8 (;@49;) 9 (;@48;) 10 (;@47;) 11 (;@46;) 12 (;@45;) 13 (;@44;) 14 (;@43;) 15 (;@42;) 16 (;@41;) 17 (;@40;) 18 (;@39;) 19 (;@38;) 20 (;@37;) 21 (;@36;) 22 (;@35;) 23 (;@34;) 24 (;@33;) 25 (;@32;) 26 (;@31;) 27 (;@30;) 28 (;@29;) 29 (;@28;) 30 (;@27;) 31 (;@26;) 32 (;@25;) 33 (;@24;) 34 (;@23;) 35 (;@22;) 36 (;@21;) 37 (;@20;) 38 (;@19;) 39 (;@18;) 40 (;@17;) 41 (;@16;) 42 (;@15;) 43 (;@14;) 44 (;@13;) 45 (;@12;) 46 (;@11;) 47 (;@10;) 48 (;@9;) 49 (;@8;) 50 (;@7;) 51 (;@6;) 52 (;@5;) 53 (;@4;) 54 (;@3;) 56 (;@1;)
                                                                                                                    end
                                                                                                                    global.get 0
                                                                                                                    local.set 7
                                                                                                                    global.get 0
                                                                                                                    i32.const 4
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 7
                                                                                                                    local.get 0
                                                                                                                    i32.store
                                                                                                                    global.get 0
                                                                                                                    local.set 8
                                                                                                                    global.get 0
                                                                                                                    i32.const 4
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 8
                                                                                                                    local.get 1
                                                                                                                    i32.store
                                                                                                                    global.get 0
                                                                                                                    local.set 9
                                                                                                                    global.get 0
                                                                                                                    i32.const 4
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 9
                                                                                                                    local.get 2
                                                                                                                    i32.store
                                                                                                                    global.get 0
                                                                                                                    local.set 10
                                                                                                                    global.get 0
                                                                                                                    i32.const 4
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 10
                                                                                                                    local.get 3
                                                                                                                    i32.store
                                                                                                                    global.get 0
                                                                                                                    local.set 11
                                                                                                                    global.get 0
                                                                                                                    i32.const 4
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 11
                                                                                                                    local.get 4
                                                                                                                    i32.store
                                                                                                                    global.get 0
                                                                                                                    local.set 12
                                                                                                                    global.get 0
                                                                                                                    i32.const 4
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 12
                                                                                                                    local.get 5
                                                                                                                    i32.store
                                                                                                                    global.get 0
                                                                                                                    local.set 13
                                                                                                                    global.get 0
                                                                                                                    i32.const 4
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 13
                                                                                                                    local.get 6
                                                                                                                    i32.store
                                                                                                                    global.get 0
                                                                                                                    local.set 14
                                                                                                                    global.get 0
                                                                                                                    i32.const 1
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 14
                                                                                                                    i32.const 1
                                                                                                                    i32.store8
                                                                                                                    global.get 0
                                                                                                                    local.set 15
                                                                                                                    global.get 0
                                                                                                                    i32.const 1
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 15
                                                                                                                    i32.const 1
                                                                                                                    i32.store8
                                                                                                                    global.get 0
                                                                                                                    local.set 16
                                                                                                                    global.get 0
                                                                                                                    i32.const 1
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 16
                                                                                                                    i32.const 1
                                                                                                                    i32.store8
                                                                                                                    local.get 10
                                                                                                                    i32.load
                                                                                                                    local.set 17
                                                                                                                    local.get 17
                                                                                                                    i32.const 1
                                                                                                                    i32.lt_s
                                                                                                                    local.set 18
                                                                                                                    local.get 18
                                                                                                                    if  ;; label = @57
                                                                                                                      i32.const 3
                                                                                                                      local.set 92
                                                                                                                      br 55 (;@2;)
                                                                                                                    else
                                                                                                                      i32.const 4
                                                                                                                      local.set 92
                                                                                                                      br 55 (;@2;)
                                                                                                                    end
                                                                                                                  end
                                                                                                                  local.get 93
                                                                                                                  global.set 0
                                                                                                                  i32.const 0
                                                                                                                  return
                                                                                                                end
                                                                                                                global.get 0
                                                                                                                local.set 19
                                                                                                                global.get 0
                                                                                                                i32.const 1
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 19
                                                                                                                i32.const 1
                                                                                                                i32.store8
                                                                                                                global.get 0
                                                                                                                local.set 20
                                                                                                                global.get 0
                                                                                                                i32.const 1
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 20
                                                                                                                i32.const 1
                                                                                                                i32.store8
                                                                                                                local.get 9
                                                                                                                i32.load
                                                                                                                local.set 21
                                                                                                                local.get 10
                                                                                                                i32.load
                                                                                                                local.set 22
                                                                                                                local.get 21
                                                                                                                local.get 22
                                                                                                                call 2
                                                                                                                local.set 23
                                                                                                                local.get 23
                                                                                                                i32.eqz
                                                                                                                local.set 24
                                                                                                                local.get 24
                                                                                                                if  ;; label = @55
                                                                                                                  i32.const 17
                                                                                                                  local.set 92
                                                                                                                  br 53 (;@2;)
                                                                                                                else
                                                                                                                  i32.const 18
                                                                                                                  local.set 92
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                              end
                                                                                                              i32.const 5
                                                                                                              local.set 92
                                                                                                              br 51 (;@2;)
                                                                                                            end
                                                                                                            local.get 10
                                                                                                            i32.load
                                                                                                            local.set 25
                                                                                                            local.get 25
                                                                                                            i32.const 16
                                                                                                            i32.gt_s
                                                                                                            local.set 26
                                                                                                            local.get 16
                                                                                                            local.get 26
                                                                                                            i32.store8
                                                                                                            i32.const 5
                                                                                                            local.set 92
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                          local.get 16
                                                                                                          i32.load8_u
                                                                                                          local.set 27
                                                                                                          local.get 27
                                                                                                          if  ;; label = @52
                                                                                                            i32.const 6
                                                                                                            local.set 92
                                                                                                            br 50 (;@2;)
                                                                                                          else
                                                                                                            i32.const 7
                                                                                                            local.set 92
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                        end
                                                                                                        i32.const 8
                                                                                                        local.set 92
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                      local.get 11
                                                                                                      i32.load
                                                                                                      local.set 28
                                                                                                      local.get 28
                                                                                                      i32.const 1
                                                                                                      i32.lt_s
                                                                                                      local.set 29
                                                                                                      local.get 15
                                                                                                      local.get 29
                                                                                                      i32.store8
                                                                                                      i32.const 8
                                                                                                      local.set 92
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                    local.get 15
                                                                                                    i32.load8_u
                                                                                                    local.set 30
                                                                                                    local.get 30
                                                                                                    if  ;; label = @49
                                                                                                      i32.const 9
                                                                                                      local.set 92
                                                                                                      br 47 (;@2;)
                                                                                                    else
                                                                                                      i32.const 10
                                                                                                      local.set 92
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                  end
                                                                                                  i32.const 11
                                                                                                  local.set 92
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                                local.get 11
                                                                                                i32.load
                                                                                                local.set 31
                                                                                                local.get 31
                                                                                                i32.const 64
                                                                                                i32.gt_s
                                                                                                local.set 32
                                                                                                local.get 14
                                                                                                local.get 32
                                                                                                i32.store8
                                                                                                i32.const 11
                                                                                                local.set 92
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                              local.get 14
                                                                                              i32.load8_u
                                                                                              local.set 33
                                                                                              local.get 33
                                                                                              if  ;; label = @46
                                                                                                i32.const 12
                                                                                                local.set 92
                                                                                                br 44 (;@2;)
                                                                                              else
                                                                                                i32.const 13
                                                                                                local.set 92
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                            end
                                                                                            i32.const 0
                                                                                            i32.const 1
                                                                                            i32.sub
                                                                                            local.set 34
                                                                                            local.get 93
                                                                                            global.set 0
                                                                                            local.get 34
                                                                                            return
                                                                                          end
                                                                                          i32.const 14
                                                                                          local.set 92
                                                                                          br 41 (;@2;)
                                                                                        end
                                                                                        i32.const 2
                                                                                        local.set 92
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      i32.const 14
                                                                                      local.set 92
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    global.get 0
                                                                                    local.set 35
                                                                                    global.get 0
                                                                                    i32.const 4
                                                                                    i32.add
                                                                                    global.set 0
                                                                                    local.get 35
                                                                                    i32.const 0
                                                                                    i32.store
                                                                                    i32.const 0
                                                                                    f32.convert_i32_s
                                                                                    local.set 36
                                                                                    global.get 0
                                                                                    local.set 37
                                                                                    global.get 0
                                                                                    i32.const 4
                                                                                    i32.add
                                                                                    global.set 0
                                                                                    local.get 37
                                                                                    local.get 36
                                                                                    f32.store
                                                                                    i32.const 29
                                                                                    local.set 92
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  i32.const 19
                                                                                  local.set 92
                                                                                  br 37 (;@2;)
                                                                                end
                                                                                local.get 7
                                                                                i32.load
                                                                                local.set 38
                                                                                local.get 10
                                                                                i32.load
                                                                                local.set 39
                                                                                local.get 11
                                                                                i32.load
                                                                                local.set 40
                                                                                local.get 39
                                                                                local.get 40
                                                                                i32.mul
                                                                                local.set 41
                                                                                local.get 38
                                                                                local.get 41
                                                                                call 2
                                                                                local.set 42
                                                                                local.get 42
                                                                                i32.eqz
                                                                                local.set 43
                                                                                local.get 20
                                                                                local.get 43
                                                                                i32.store8
                                                                                i32.const 19
                                                                                local.set 92
                                                                                br 36 (;@2;)
                                                                              end
                                                                              local.get 20
                                                                              i32.load8_u
                                                                              local.set 44
                                                                              local.get 44
                                                                              if  ;; label = @38
                                                                                i32.const 20
                                                                                local.set 92
                                                                                br 36 (;@2;)
                                                                              else
                                                                                i32.const 21
                                                                                local.set 92
                                                                                br 36 (;@2;)
                                                                              end
                                                                            end
                                                                            i32.const 22
                                                                            local.set 92
                                                                            br 34 (;@2;)
                                                                          end
                                                                          local.get 8
                                                                          i32.load
                                                                          local.set 45
                                                                          local.get 11
                                                                          i32.load
                                                                          local.set 46
                                                                          local.get 46
                                                                          i32.const 128
                                                                          i32.mul
                                                                          local.set 47
                                                                          local.get 45
                                                                          local.get 47
                                                                          call 1
                                                                          local.set 48
                                                                          local.get 48
                                                                          i32.eqz
                                                                          local.set 49
                                                                          local.get 19
                                                                          local.get 49
                                                                          i32.store8
                                                                          i32.const 22
                                                                          local.set 92
                                                                          br 33 (;@2;)
                                                                        end
                                                                        local.get 19
                                                                        i32.load8_u
                                                                        local.set 50
                                                                        local.get 50
                                                                        if  ;; label = @35
                                                                          i32.const 23
                                                                          local.set 92
                                                                          br 33 (;@2;)
                                                                        else
                                                                          i32.const 24
                                                                          local.set 92
                                                                          br 33 (;@2;)
                                                                        end
                                                                      end
                                                                      i32.const 0
                                                                      i32.const 2
                                                                      i32.sub
                                                                      local.set 51
                                                                      local.get 93
                                                                      global.set 0
                                                                      local.get 51
                                                                      return
                                                                    end
                                                                    i32.const 25
                                                                    local.set 92
                                                                    br 30 (;@2;)
                                                                  end
                                                                  i32.const 16
                                                                  local.set 92
                                                                  br 29 (;@2;)
                                                                end
                                                                i32.const 25
                                                                local.set 92
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 12
                                                              i32.load
                                                              local.set 52
                                                              local.get 10
                                                              i32.load
                                                              local.set 53
                                                              local.get 53
                                                              i32.const 128
                                                              i32.mul
                                                              local.set 54
                                                              local.get 52
                                                              local.get 54
                                                              call 1
                                                              local.set 55
                                                              local.get 55
                                                              i32.eqz
                                                              local.set 56
                                                              local.get 56
                                                              if  ;; label = @30
                                                                i32.const 48
                                                                local.set 92
                                                                br 28 (;@2;)
                                                              else
                                                                i32.const 49
                                                                local.set 92
                                                                br 28 (;@2;)
                                                              end
                                                            end
                                                            i32.const 27
                                                            local.set 92
                                                            br 26 (;@2;)
                                                          end
                                                          local.get 35
                                                          i32.load
                                                          local.set 57
                                                          local.get 10
                                                          i32.load
                                                          local.set 58
                                                          local.get 57
                                                          local.get 58
                                                          i32.lt_s
                                                          local.set 59
                                                          local.get 59
                                                          if  ;; label = @28
                                                            i32.const 33
                                                            local.set 92
                                                            br 26 (;@2;)
                                                          else
                                                            i32.const 34
                                                            local.set 92
                                                            br 26 (;@2;)
                                                          end
                                                        end
                                                        i32.const 28
                                                        local.set 92
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 29
                                                      local.set 92
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 31
                                                    local.set 92
                                                    br 22 (;@2;)
                                                  end
                                                  local.get 7
                                                  i32.load
                                                  local.set 60
                                                  local.get 8
                                                  i32.load
                                                  local.set 61
                                                  local.get 12
                                                  i32.load
                                                  local.set 62
                                                  local.get 35
                                                  i32.load
                                                  local.set 63
                                                  local.get 11
                                                  i32.load
                                                  local.set 64
                                                  local.get 9
                                                  i32.load
                                                  local.set 65
                                                  local.get 35
                                                  i32.load
                                                  local.set 66
                                                  local.get 65
                                                  local.get 66
                                                  i32.const 4
                                                  i32.mul
                                                  i32.add
                                                  local.set 67
                                                  local.get 67
                                                  f32.load
                                                  local.set 68
                                                  local.get 13
                                                  i32.load
                                                  local.set 69
                                                  local.get 35
                                                  i32.load
                                                  local.set 70
                                                  local.get 69
                                                  local.get 70
                                                  i32.const 4
                                                  i32.mul
                                                  i32.add
                                                  local.set 71
                                                  local.get 71
                                                  f32.load
                                                  local.set 72
                                                  local.get 60
                                                  local.get 61
                                                  local.get 62
                                                  local.get 63
                                                  local.get 64
                                                  local.get 68
                                                  local.get 72
                                                  call 3
                                                  local.set 73
                                                  local.get 37
                                                  local.get 73
                                                  f32.store
                                                  global.get 0
                                                  local.set 74
                                                  global.get 0
                                                  i32.const 1
                                                  i32.add
                                                  global.set 0
                                                  local.get 74
                                                  i32.const 1
                                                  i32.store8
                                                  local.get 37
                                                  f32.load
                                                  local.set 75
                                                  local.get 75
                                                  call 0
                                                  local.set 76
                                                  local.get 76
                                                  i32.eqz
                                                  local.set 77
                                                  local.get 77
                                                  if  ;; label = @24
                                                    i32.const 37
                                                    local.set 92
                                                    br 22 (;@2;)
                                                  else
                                                    i32.const 38
                                                    local.set 92
                                                    br 22 (;@2;)
                                                  end
                                                end
                                                i32.const 28
                                                local.set 92
                                                br 20 (;@2;)
                                              end
                                              i32.const 32
                                              local.set 92
                                              br 19 (;@2;)
                                            end
                                            local.get 37
                                            f32.load
                                            local.set 78
                                            local.get 13
                                            i32.load
                                            local.set 79
                                            local.get 13
                                            i32.load
                                            local.set 80
                                            local.get 35
                                            i32.load
                                            local.set 81
                                            local.get 13
                                            i32.load
                                            local.set 82
                                            local.get 82
                                            local.get 81
                                            i32.const 4
                                            i32.mul
                                            i32.add
                                            local.set 83
                                            local.get 83
                                            local.get 78
                                            f32.store
                                            local.get 35
                                            i32.load
                                            local.set 84
                                            local.get 84
                                            i32.const 1
                                            i32.add
                                            local.set 85
                                            local.get 35
                                            local.get 85
                                            i32.store
                                            i32.const 44
                                            local.set 92
                                            br 18 (;@2;)
                                          end
                                          i32.const 39
                                          local.set 92
                                          br 17 (;@2;)
                                        end
                                        local.get 37
                                        f32.load
                                        local.set 86
                                        i32.const 0
                                        f32.convert_i32_s
                                        local.set 87
                                        local.get 86
                                        local.get 87
                                        f32.le
                                        local.set 88
                                        local.get 74
                                        local.get 88
                                        i32.store8
                                        i32.const 39
                                        local.set 92
                                        br 16 (;@2;)
                                      end
                                      local.get 74
                                      i32.load8_u
                                      local.set 89
                                      local.get 89
                                      if  ;; label = @18
                                        i32.const 40
                                        local.set 92
                                        br 16 (;@2;)
                                      else
                                        i32.const 41
                                        local.set 92
                                        br 16 (;@2;)
                                      end
                                    end
                                    i32.const 0
                                    i32.const 3
                                    i32.sub
                                    local.set 90
                                    local.get 93
                                    global.set 0
                                    local.get 90
                                    return
                                  end
                                  i32.const 42
                                  local.set 92
                                  br 13 (;@2;)
                                end
                                i32.const 36
                                local.set 92
                                br 12 (;@2;)
                              end
                              i32.const 42
                              local.set 92
                              br 11 (;@2;)
                            end
                            i32.const 35
                            local.set 92
                            br 10 (;@2;)
                          end
                          i32.const 35
                          local.set 92
                          br 9 (;@2;)
                        end
                        i32.const 29
                        local.set 92
                        br 8 (;@2;)
                      end
                      local.get 93
                      global.set 0
                      i32.const 0
                      return
                    end
                    i32.const 0
                    i32.const 3
                    i32.sub
                    local.set 91
                    local.get 93
                    global.set 0
                    local.get 91
                    return
                  end
                  i32.const 50
                  local.set 92
                  br 5 (;@2;)
                end
                i32.const 47
                local.set 92
                br 4 (;@2;)
              end
              i32.const 50
              local.set 92
              br 3 (;@2;)
            end
            i32.const 54
            local.set 92
            br 2 (;@2;)
          end
          i32.const 52
          local.set 92
          br 1 (;@2;)
        end
        i32.const 1
        local.set 92
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;5;) (type 3) (param i32 i32 i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 9
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 8
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                local.get 5
                local.get 6
                call 4
                local.set 7
                local.get 9
                global.set 0
                local.get 7
                return
              end
              local.get 9
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 8
            br 2 (;@2;)
          end
          i32.const 2
          local.set 8
          br 1 (;@2;)
        end
        i32.const 1
        local.set 8
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;6;) (type 4) (param i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 f32 f32 f32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 68
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            local.get 67
                                                                                                            br_table 0 (;@52;) 1 (;@51;) 2 (;@50;) 3 (;@49;) 4 (;@48;) 5 (;@47;) 6 (;@46;) 7 (;@45;) 8 (;@44;) 9 (;@43;) 10 (;@42;) 11 (;@41;) 12 (;@40;) 13 (;@39;) 14 (;@38;) 15 (;@37;) 16 (;@36;) 17 (;@35;) 18 (;@34;) 19 (;@33;) 20 (;@32;) 21 (;@31;) 22 (;@30;) 23 (;@29;) 24 (;@28;) 25 (;@27;) 26 (;@26;) 27 (;@25;) 28 (;@24;) 29 (;@23;) 30 (;@22;) 31 (;@21;) 32 (;@20;) 33 (;@19;) 34 (;@18;) 35 (;@17;) 36 (;@16;) 37 (;@15;) 38 (;@14;) 39 (;@13;) 40 (;@12;) 41 (;@11;) 42 (;@10;) 43 (;@9;) 44 (;@8;) 45 (;@7;) 46 (;@6;) 47 (;@5;) 48 (;@4;) 49 (;@3;) 51 (;@1;)
                                                                                                          end
                                                                                                          global.get 0
                                                                                                          local.set 4
                                                                                                          global.get 0
                                                                                                          i32.const 4
                                                                                                          i32.add
                                                                                                          global.set 0
                                                                                                          local.get 4
                                                                                                          local.get 0
                                                                                                          i32.store
                                                                                                          global.get 0
                                                                                                          local.set 5
                                                                                                          global.get 0
                                                                                                          i32.const 4
                                                                                                          i32.add
                                                                                                          global.set 0
                                                                                                          local.get 5
                                                                                                          local.get 1
                                                                                                          i32.store
                                                                                                          global.get 0
                                                                                                          local.set 6
                                                                                                          global.get 0
                                                                                                          i32.const 4
                                                                                                          i32.add
                                                                                                          global.set 0
                                                                                                          local.get 6
                                                                                                          local.get 2
                                                                                                          i32.store
                                                                                                          global.get 0
                                                                                                          local.set 7
                                                                                                          global.get 0
                                                                                                          i32.const 4
                                                                                                          i32.add
                                                                                                          global.set 0
                                                                                                          local.get 7
                                                                                                          local.get 3
                                                                                                          i32.store
                                                                                                          global.get 0
                                                                                                          local.set 8
                                                                                                          global.get 0
                                                                                                          i32.const 1
                                                                                                          i32.add
                                                                                                          global.set 0
                                                                                                          local.get 8
                                                                                                          i32.const 1
                                                                                                          i32.store8
                                                                                                          local.get 6
                                                                                                          i32.load
                                                                                                          local.set 9
                                                                                                          local.get 9
                                                                                                          i32.const 1
                                                                                                          i32.lt_s
                                                                                                          local.set 10
                                                                                                          local.get 10
                                                                                                          if  ;; label = @52
                                                                                                            i32.const 3
                                                                                                            local.set 67
                                                                                                            br 50 (;@2;)
                                                                                                          else
                                                                                                            i32.const 4
                                                                                                            local.set 67
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                        end
                                                                                                        local.get 68
                                                                                                        global.set 0
                                                                                                        i32.const 0
                                                                                                        return
                                                                                                      end
                                                                                                      global.get 0
                                                                                                      local.set 11
                                                                                                      global.get 0
                                                                                                      i32.const 4
                                                                                                      i32.add
                                                                                                      global.set 0
                                                                                                      local.get 11
                                                                                                      i32.const 0
                                                                                                      i32.store
                                                                                                      global.get 0
                                                                                                      local.set 12
                                                                                                      global.get 0
                                                                                                      i32.const 4
                                                                                                      i32.add
                                                                                                      global.set 0
                                                                                                      local.get 12
                                                                                                      i32.const 0
                                                                                                      i32.store
                                                                                                      global.get 0
                                                                                                      local.set 13
                                                                                                      global.get 0
                                                                                                      i32.const 4
                                                                                                      i32.add
                                                                                                      global.set 0
                                                                                                      local.get 13
                                                                                                      i32.const 0
                                                                                                      i32.store
                                                                                                      i32.const 0
                                                                                                      f32.convert_i32_s
                                                                                                      local.set 14
                                                                                                      global.get 0
                                                                                                      local.set 15
                                                                                                      global.get 0
                                                                                                      i32.const 4
                                                                                                      i32.add
                                                                                                      global.set 0
                                                                                                      local.get 15
                                                                                                      local.get 14
                                                                                                      f32.store
                                                                                                      i32.const 12
                                                                                                      local.set 67
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                    i32.const 5
                                                                                                    local.set 67
                                                                                                    br 46 (;@2;)
                                                                                                  end
                                                                                                  local.get 6
                                                                                                  i32.load
                                                                                                  local.set 16
                                                                                                  local.get 16
                                                                                                  i32.const 16
                                                                                                  i32.gt_s
                                                                                                  local.set 17
                                                                                                  local.get 8
                                                                                                  local.get 17
                                                                                                  i32.store8
                                                                                                  i32.const 5
                                                                                                  local.set 67
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                                local.get 8
                                                                                                i32.load8_u
                                                                                                local.set 18
                                                                                                local.get 18
                                                                                                if  ;; label = @47
                                                                                                  i32.const 6
                                                                                                  local.set 67
                                                                                                  br 45 (;@2;)
                                                                                                else
                                                                                                  i32.const 7
                                                                                                  local.set 67
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                              end
                                                                                              i32.const 0
                                                                                              i32.const 1
                                                                                              i32.sub
                                                                                              local.set 19
                                                                                              local.get 68
                                                                                              global.set 0
                                                                                              local.get 19
                                                                                              return
                                                                                            end
                                                                                            i32.const 8
                                                                                            local.set 67
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          i32.const 2
                                                                                          local.set 67
                                                                                          br 41 (;@2;)
                                                                                        end
                                                                                        i32.const 8
                                                                                        local.set 67
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      local.get 68
                                                                                      global.set 0
                                                                                      i32.const 0
                                                                                      return
                                                                                    end
                                                                                    i32.const 10
                                                                                    local.set 67
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  local.get 11
                                                                                  i32.load
                                                                                  local.set 20
                                                                                  local.get 6
                                                                                  i32.load
                                                                                  local.set 21
                                                                                  local.get 20
                                                                                  local.get 21
                                                                                  i32.lt_s
                                                                                  local.set 22
                                                                                  local.get 22
                                                                                  if  ;; label = @40
                                                                                    i32.const 16
                                                                                    local.set 67
                                                                                    br 38 (;@2;)
                                                                                  else
                                                                                    i32.const 17
                                                                                    local.set 67
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                end
                                                                                i32.const 11
                                                                                local.set 67
                                                                                br 36 (;@2;)
                                                                              end
                                                                              i32.const 12
                                                                              local.set 67
                                                                              br 35 (;@2;)
                                                                            end
                                                                            i32.const 14
                                                                            local.set 67
                                                                            br 34 (;@2;)
                                                                          end
                                                                          global.get 0
                                                                          local.set 23
                                                                          global.get 0
                                                                          i32.const 1
                                                                          i32.add
                                                                          global.set 0
                                                                          local.get 23
                                                                          i32.const 1
                                                                          i32.store8
                                                                          local.get 5
                                                                          i32.load
                                                                          local.set 24
                                                                          local.get 11
                                                                          i32.load
                                                                          local.set 25
                                                                          local.get 24
                                                                          local.get 25
                                                                          i32.const 4
                                                                          i32.mul
                                                                          i32.add
                                                                          local.set 26
                                                                          local.get 26
                                                                          f32.load
                                                                          local.set 27
                                                                          local.get 27
                                                                          call 0
                                                                          local.set 28
                                                                          local.get 28
                                                                          i32.eqz
                                                                          local.set 29
                                                                          local.get 29
                                                                          if  ;; label = @36
                                                                            i32.const 20
                                                                            local.set 67
                                                                            br 34 (;@2;)
                                                                          else
                                                                            i32.const 21
                                                                            local.set 67
                                                                            br 34 (;@2;)
                                                                          end
                                                                        end
                                                                        i32.const 11
                                                                        local.set 67
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 15
                                                                      local.set 67
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 12
                                                                    i32.const 0
                                                                    i32.store
                                                                    i32.const 29
                                                                    local.set 67
                                                                    br 30 (;@2;)
                                                                  end
                                                                  i32.const 22
                                                                  local.set 67
                                                                  br 29 (;@2;)
                                                                end
                                                                local.get 5
                                                                i32.load
                                                                local.set 30
                                                                local.get 11
                                                                i32.load
                                                                local.set 31
                                                                local.get 30
                                                                local.get 31
                                                                i32.const 4
                                                                i32.mul
                                                                i32.add
                                                                local.set 32
                                                                local.get 32
                                                                f32.load
                                                                local.set 33
                                                                i32.const 0
                                                                f32.convert_i32_s
                                                                local.set 34
                                                                local.get 33
                                                                local.get 34
                                                                f32.le
                                                                local.set 35
                                                                local.get 23
                                                                local.get 35
                                                                i32.store8
                                                                i32.const 22
                                                                local.set 67
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 23
                                                              i32.load8_u
                                                              local.set 36
                                                              local.get 36
                                                              if  ;; label = @30
                                                                i32.const 23
                                                                local.set 67
                                                                br 28 (;@2;)
                                                              else
                                                                i32.const 24
                                                                local.set 67
                                                                br 28 (;@2;)
                                                              end
                                                            end
                                                            i32.const 0
                                                            i32.const 2
                                                            i32.sub
                                                            local.set 37
                                                            local.get 68
                                                            global.set 0
                                                            local.get 37
                                                            return
                                                          end
                                                          i32.const 25
                                                          local.set 67
                                                          br 25 (;@2;)
                                                        end
                                                        i32.const 19
                                                        local.set 67
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 25
                                                      local.set 67
                                                      br 23 (;@2;)
                                                    end
                                                    local.get 11
                                                    i32.load
                                                    local.set 38
                                                    local.get 38
                                                    i32.const 1
                                                    i32.add
                                                    local.set 39
                                                    local.get 11
                                                    local.get 39
                                                    i32.store
                                                    i32.const 44
                                                    local.set 67
                                                    br 22 (;@2;)
                                                  end
                                                  i32.const 27
                                                  local.set 67
                                                  br 21 (;@2;)
                                                end
                                                local.get 12
                                                i32.load
                                                local.set 40
                                                local.get 40
                                                i32.const 128
                                                i32.lt_s
                                                local.set 41
                                                local.get 41
                                                if  ;; label = @23
                                                  i32.const 33
                                                  local.set 67
                                                  br 21 (;@2;)
                                                else
                                                  i32.const 34
                                                  local.set 67
                                                  br 21 (;@2;)
                                                end
                                              end
                                              i32.const 28
                                              local.set 67
                                              br 19 (;@2;)
                                            end
                                            i32.const 29
                                            local.set 67
                                            br 18 (;@2;)
                                          end
                                          i32.const 31
                                          local.set 67
                                          br 17 (;@2;)
                                        end
                                        local.get 11
                                        i32.load
                                        local.set 42
                                        local.get 42
                                        i32.const 128
                                        i32.mul
                                        local.set 43
                                        local.get 12
                                        i32.load
                                        local.set 44
                                        local.get 43
                                        local.get 44
                                        i32.add
                                        local.set 45
                                        local.get 13
                                        local.get 45
                                        i32.store
                                        local.get 4
                                        i32.load
                                        local.set 46
                                        local.get 13
                                        i32.load
                                        local.set 47
                                        local.get 46
                                        local.get 47
                                        i32.const 4
                                        i32.mul
                                        i32.add
                                        local.set 48
                                        local.get 48
                                        f32.load
                                        local.set 49
                                        local.get 5
                                        i32.load
                                        local.set 50
                                        local.get 11
                                        i32.load
                                        local.set 51
                                        local.get 50
                                        local.get 51
                                        i32.const 4
                                        i32.mul
                                        i32.add
                                        local.set 52
                                        local.get 52
                                        f32.load
                                        local.set 53
                                        local.get 49
                                        local.get 53
                                        f32.div
                                        local.set 54
                                        local.get 15
                                        local.get 54
                                        f32.store
                                        local.get 15
                                        f32.load
                                        local.set 55
                                        local.get 55
                                        call 0
                                        local.set 56
                                        local.get 56
                                        i32.eqz
                                        local.set 57
                                        local.get 57
                                        if  ;; label = @19
                                          i32.const 37
                                          local.set 67
                                          br 17 (;@2;)
                                        else
                                          i32.const 38
                                          local.set 67
                                          br 17 (;@2;)
                                        end
                                      end
                                      i32.const 28
                                      local.set 67
                                      br 15 (;@2;)
                                    end
                                    i32.const 32
                                    local.set 67
                                    br 14 (;@2;)
                                  end
                                  local.get 15
                                  f32.load
                                  local.set 58
                                  local.get 7
                                  i32.load
                                  local.set 59
                                  local.get 7
                                  i32.load
                                  local.set 60
                                  local.get 13
                                  i32.load
                                  local.set 61
                                  local.get 7
                                  i32.load
                                  local.set 62
                                  local.get 62
                                  local.get 61
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 63
                                  local.get 63
                                  local.get 58
                                  f32.store
                                  local.get 12
                                  i32.load
                                  local.set 64
                                  local.get 64
                                  i32.const 1
                                  i32.add
                                  local.set 65
                                  local.get 12
                                  local.get 65
                                  i32.store
                                  i32.const 41
                                  local.set 67
                                  br 13 (;@2;)
                                end
                                i32.const 0
                                i32.const 3
                                i32.sub
                                local.set 66
                                local.get 68
                                global.set 0
                                local.get 66
                                return
                              end
                              i32.const 39
                              local.set 67
                              br 11 (;@2;)
                            end
                            i32.const 36
                            local.set 67
                            br 10 (;@2;)
                          end
                          i32.const 39
                          local.set 67
                          br 9 (;@2;)
                        end
                        i32.const 35
                        local.set 67
                        br 8 (;@2;)
                      end
                      i32.const 35
                      local.set 67
                      br 7 (;@2;)
                    end
                    i32.const 29
                    local.set 67
                    br 6 (;@2;)
                  end
                  i32.const 18
                  local.set 67
                  br 5 (;@2;)
                end
                i32.const 18
                local.set 67
                br 4 (;@2;)
              end
              i32.const 12
              local.set 67
              br 3 (;@2;)
            end
            i32.const 49
            local.set 67
            br 2 (;@2;)
          end
          i32.const 47
          local.set 67
          br 1 (;@2;)
        end
        i32.const 1
        local.set 67
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;7;) (type 4) (param i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 6
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 5
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                call 6
                local.set 4
                local.get 6
                global.set 0
                local.get 4
                return
              end
              local.get 6
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 5
            br 2 (;@2;)
          end
          i32.const 2
          local.set 5
          br 1 (;@2;)
        end
        i32.const 1
        local.set 5
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;8;) (type 1) (param i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 4
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 3
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.set 2
                local.get 4
                global.set 0
                i32.const 0
                return
              end
              local.get 4
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 3
            br 2 (;@2;)
          end
          i32.const 2
          local.set 3
          br 1 (;@2;)
        end
        i32.const 1
        local.set 3
        br 0 (;@2;)
      end
    end
    unreachable)
  (table (;0;) 9 9 funcref)
  (memory (;0;) 16)
  (global (;0;) (mut i32) (i32.const 65536))
  (global (;1;) (mut i32) (i32.const 196608))
  (global (;2;) (mut i32) (i32.const 0))
  (global (;3;) (mut i32) (i32.const 0))
  (global (;4;) (mut i32) (i32.const -1))
  (global (;5;) (mut i32) (i32.const 0))
  (global (;6;) (mut i32) (i32.const 0))
  (global (;7;) (mut i32) (i32.const 0))
  (global (;8;) (mut i32) (i32.const 0))
  (global (;9;) (mut i32) (i32.const 0))
  (global (;10;) (mut i32) (i32.const 0))
  (export "memory" (memory 0))
  (export "__hike_sp" (global 0))
  (export "__hike_heap" (global 1))
  (export "IsFinite" (func 0))
  (export "FiniteVector" (func 1))
  (export "UnitVector" (func 2))
  (export "UpdateRow" (func 3))
  (export "__hike_impl_Accumulate" (func 4))
  (export "Accumulate" (func 5))
  (export "__hike_impl_Normalize" (func 6))
  (export "Normalize" (func 7))
  (export "main" (func 8))
  (elem (;0;) (i32.const 0) func 0 1 2 3 4 5 6 7 8))
